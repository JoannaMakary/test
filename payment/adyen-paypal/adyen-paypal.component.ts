import { Component, OnInit, NgZone } from '@angular/core';
import { CheckoutService } from '@app/services/checkout.service';
import { ConnectionService } from '@app/services/connection.service';
import { RibonService } from '@app/services/ribon.service';
import { DialogService } from '@common/notification/dialog/dialog.service';
import { PaymentComponent } from '../payment.component';
import AdyenCheckout from '@adyen/adyen-web';
import { CalendarService } from '@app/services/calendar.service';

import * as moment from 'moment-timezone';
declare var window: any;

@Component({
	selector: 'payment-adyen-paypal',
	templateUrl: './adyen-paypal.component.html',
	styleUrls: ['./adyen-paypal.component.scss'],
})
export class AdyenPayPalComponent implements OnInit {
	methodId = 'bankdeposit';
	adyenCheckout: any = false;
	currency: any = 'CAD';
	isAuthorised: any = false;
	ppAuthorisation: any = '';
	reference_id: string = '';

	constructor(
		private checkout: CheckoutService,
		private connection: ConnectionService,
		private ribon: RibonService,
		private dialog: DialogService,
		private zone: NgZone,
		private payment: PaymentComponent,
		private calendar: CalendarService
	) {}

	async ngOnInit() {
		if (this.checkout.initializedPayment) {
			let response = await this.checkout.service.deinitializePayment({ methodId: this.checkout.initializedPayment });
			// console.log('deinit', this.checkout.initializedPayment, response);
		}
		this.initAdyenPayPal();
	}

	async initAdyenPayPal() {
		try {
			let adyen_payments = await this.connection
				.post(`${this.ribon.ribonLambdaURL}/${window.store}/storefront/adyen-payment-methods`, { amount: this.checkout.checkout.grandTotal * 100, currency: this.currency })
				.toPromise();

			if (adyen_payments?.paymentMethods?.length) {
				adyen_payments = {
					paymentMethods: adyen_payments.paymentMethods.filter((pm) => {
						if (pm.type == 'paypal') {
							return pm;
						}
					}),
				};
			}

			// console.log('adyen_payments', adyen_payments);

			let $this = this;

			const configuration = {
				paymentMethodsResponse: adyen_payments,
				clientKey: `test_MIXFFUKGXZB5VIVLT52UTZRVMMBT47ZX`,
				locale: 'en-CA',
				environment: 'test',
				amount: {
					currency: this.currency,
					value: this.checkout.checkout.grandTotal * 100,
				},
				onSubmit: async (state, component) => {
					try {
						// console.log('submit', state, component);
						window._loq = window._loq || []; // ensure queue available
						window._loq.push(['tag', 'PayPal-Checkout']); // Custom tag LO

						// Check that shipping options etc are valid before going through PP
						let validity = $this.checkout.isValidBilling();

						const validDates = this.payment.isValidDates();

						if (!validDates || !this.calendar.validDeliveryOptions) {
							this.checkout.paymentLoading = false;
							return false;
						}

						if (this.calendar.validDeliveryOptions) {
							if (validity) {
								const billingShippingMatchIndex = $this.checkout.isBillingShippingMatch();

								if (billingShippingMatchIndex > -1) {
									let dialogText = '<p>We noticed your billing address is the same as the shipping address you entered.</p>';
									dialogText += '<p>Are you sure you want to continue?</p>';
									$this.dialog.showConfirmationdialog('Hey!', dialogText, 'Yes', 'No').subscribe(function (res) {
										if (!res) {
											this.checkout.paymentLoading = false;
											return false;
										} else {
											continuePaypalProcess();
										}
									});
								} else {
									continuePaypalProcess();
								}

								async function continuePaypalProcess() {
									// We need to update the cart billing address before submitting
									if (!$this.checkout.checkout.billingAddress.postalCode) {
										$this.checkout.state = await $this.checkout.service.updateBillingAddress($this.checkout.billingAddress.value);
									}

									state.data.id = component._id;
									$this.makePayment(state.data).then((response) => {
										if (response.action) {
											component.handleAction(response.action);
										} else {
											// console.log('show final result', response);
										}
									});
								}

								// $this.completeOrder().then(response => {
								// 	console.log('complete order');
								// })
							} else {
								$this.dialog.showDialogError(
									'Something went wrong!',
									"An error has occurred trying to validate your billing address, please check your details and try again.<br><br>Please feel free to contact us if you are experiencing issues <a href='mailto:help@baskits.com'>help@baskits.com</a> / <a href='tel:18005619177'>1-800-561-9177</a>."
								);
							}
						}
					} catch (e) {
						$this.dialog.showDialogError(
							'Something went wrong!',
							"An error has occurred trying to pay for your order, please check your details and try again.<br><br>Please feel free to contact us if you are experiencing issues <a href='mailto:help@baskits.com'>help@baskits.com</a> / <a href='tel:18005619177'>1-800-561-9177</a>."
						);
					}
				},
				onAdditionalDetails: (state, component) => {
					// console.log('onAdditionalDetails', state, component);
					$this.checkout.paymentLoading = true;
					$this.zone.run(() => {});
					$this.completePayment(state.data).then((response) => {
						// console.log('complete response', response);
						this.ppAuthorisation = response;
						// once we complete the payment, let's push the payment though to bigcommerce
						$this.completeOrder(response).then((response) => {
							// do nothing
						});
					});
				},
				onChange: (state, component) => {
					// console.log('onChange', state, component);
					this.checkout.adyen_paypal_state = state;
				},
				// onCancel(state, component) {
				// 	console.log('onCancel', state, component);
				// },
			};

			const checkout = await AdyenCheckout(configuration);
			const dropinComponent = checkout.create('dropin').mount('#adyen-paypal');
		} catch (e) {
			console.log('Adyen PayPal error:', e);
		}
	}

	async makePayment(data) {
		try {
			let response = await this.connection
				.post(`${this.ribon.ribonLambdaURL}/${window.store}/storefront/adyen-paypal-pay`, { amount: this.checkout.checkout.grandTotal * 100, id: data.id, currency: this.currency })
				.toPromise();
			return response;
		} catch (e) {
			console.log('error', e);
			return false;
		}
	}

	async completePayment(data) {
		try {
			let response = await this.connection.post(`${this.ribon.ribonLambdaURL}/${window.store}/storefront/adyen-paypal-complete`, data).toPromise();
			this.reference_id = response.pspReference;
			return response;
		} catch (e) {
			console.log('error', e);
			return false;
		}
	}

	async completeOrder(result) {
		try {
			if (!result.resultCode || result.resultCode != 'Authorised') throw new Error(`Payment rejected with result ${result.resultCode}`);
			this.checkout.paymentLoading = true;
			this.isAuthorised = true;

			this.checkout.customerExisted = await this.checkout.getCustomerByEmail(this.checkout.checkout.cart.email);
			this.checkout.customerExisted = this.checkout.customerExisted?.length;

			let payload = {
				useStoreCredit: this.checkout.misc.value.store_credit,
				payment: {
					methodId: this.methodId,
					gateway: null,
				},
			};

			const shippingData = await this.checkout.getShippingData(this.checkout.checkout.id, this.checkout.checkout.consignments);
			localStorage.setItem('shippingData', JSON.stringify(shippingData));
			console.log('shippingData', shippingData);
			// let's just complete the order in a regular way
			let methods = await this.checkout.service.loadPaymentMethods();
			const bcPaymentMethods = methods.data.getPaymentMethods();
			// console.log('methods', methods, bcPaymentMethods);
			await this.checkout.service.initializePayment({ methodId: this.methodId });
			let state = await this.checkout.service.submitOrder(payload);

			const order = state.data.getOrder();
			shippingData.map((sd) => {
				sd['order_id'] = order.orderId;
				return sd;
			});
			// console.log('order', this.checkout.order);

			await this.ribon.saveShippingData(shippingData);

			await this.checkout.updateOrder(order.orderId, shippingData, 'PayPal (Adyen)');

			// the last thing we do is update the order
			let post = {
				postType: 'put',
				status_id: 11,
				payment_method: 'PayPal',
				payment_provider_id: this.reference_id,
			};
			await this.connection.post(`${this.ribon.ribonLambdaURL}/api/v1/${window.store}/v2/orders/${order.orderId}`, post).toPromise();

			this.checkout.paymentSuccess = true;

			setTimeout(() => {
				window.location.href = '/checkout/order-confirmation';
			}, 2000);
		} catch (e) {
			console.log('order error', e);
			this.checkout.paymentLoading = false;
			// PayPal was Authorised and then errored out (probably did not create an order)
			if (this.isAuthorised) {
				// Remove ability to click Place Order again so they don't keep getting charged.
				// document.querySelector('payment-adyen-paypal').remove();
				this.dialog.showDialogError(
					'Something went wrong!',
					`Your payment has been processed but the order was unable to be created, please contact support <a href="mailto:help@baskits.com">help@baskits.com</a> for assistance.`
				);

				// And we need to send an internal notification (slack and email)
				let cart_items = [];

				// Format for PP error
				window.lRows.forEach((row) => {
					cart_items.push({
						quantity: row.product.quantity,
						name: row.product.name,
						sku: row.product.sku,
						listPrice: row.product.listPrice,
						options: row.product.options,
						ship_method: row.association,
					});
				});

				let post = {
					error_message: e,
					customer_name: this.checkout.checkout.customer.fullName,
					customer_email: this.checkout.checkout.cart.email,
					customer_guest: this.checkout.checkout.customer.isGuest,
					ppAuthorisation: {
						pspReference: this.ppAuthorisation.pspReference,
						merchantReference: this.ppAuthorisation.merchantReference,
						amount: this.ppAuthorisation.amount.value / 100,
					},
					cart_items: cart_items,
					billing_address: JSON.stringify(this.checkout.billingAddress),
					shipping_address: JSON.stringify(this.checkout.checkout.consignments),
				};
				const response = await this.connection.post(`${this.ribon.ribonLambdaURL}/${window.store}/storefront/internalNotifications`, post).toPromise();
			} else {
				this.dialog.showDialogError(
					'Something went wrong!',
					"An error has occurred trying to pay for your order, please check your details and try again.<br><br>Please feel free to contact us if you are experiencing issues <a href='mailto:help@baskits.com'>help@baskits.com</a> / <a href='tel:18005619177'>1-800-561-9177</a>."
				);
			}
			return false;
		}
	}
}
