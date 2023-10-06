import { Component, OnInit } from '@angular/core';
import { RibonService } from '@app/services/ribon.service';
import { FormGroup, Validators } from '@angular/forms';
import { DynamicFormService } from '@common/forms/dynamic-form.service';
import * as moment from 'moment-timezone';

declare var window: any;

@Component({
	selector: 'checkout-order-confirmation',
	templateUrl: './order-confirmation.component.html',
	styleUrls: ['./order-confirmation.component.scss'],
})
export class OrderConfirmationComponent implements OnInit {
	order: any;
	customer: any;
	products: any;
	consignments: any;
	settings: any = {};
	loading: boolean = false;
	promptCreateAccount: boolean = false;
	createdAccount: boolean = false;
	accountForm: FormGroup;
	accountFormTemplate = [
		{
			field: 'email',
			name: 'Email',
			type: 'email',
			size_class: 'full',
			error: 'Please enter a valid email',
			validator: Validators.compose([
				Validators.required,
				Validators.pattern(/^\s*(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,63}))\s*$/),
			]),
		},
		{
			field: 'password',
			name: 'Password',
			type: 'password',
			size_class: 'full',
			error: 'Passwords must be at least 7 characters and contain both alphabetic and numeric characters',
			validator: Validators.compose([Validators.required, Validators.minLength(7), Validators.pattern(/^(?=.*[a-zA-Z])(?=.*\d).*$/)]),
		},
		{ field: 'email_opt_in', name: 'Sign up for our emails', type: 'checkbox', size_class: 'full' },
	];

	constructor(private ribon: RibonService, private df: DynamicFormService) {}

	async ngOnInit() {
		this.loading = true;
		this.accountForm = this.df.createForm(this.accountFormTemplate, {});
		await this.getOrder();
	}

	ngAfterViewChecked() {
		// const elements = document.querySelectorAll('#baskits-checkout .mat-horizontal-stepper-header-container, .checkout-step button, .checkout-step a, .checkout-step h2, .checkout-step h3, .checkout-step .mat-radio-button, .checkout-step p, .checkout-step span, .checkout-step .mat-form-field');
		const elements = document.querySelectorAll(
			'#baskits-checkout #baskits-checkout button, #baskits-checkout a, #baskits-checkout h2, #baskits-checkout h3, #baskits-checkout .mat-radio-button, #baskits-checkout p, #baskits-checkout span, #baskits-checkout .mat-form-field'
		);

		if (this.loading) {
			elements.forEach((element: HTMLElement) => {
				element.classList.add('skeleton-animation');
			});
		} else {
			elements.forEach((element: HTMLElement) => {
				element.classList.remove('skeleton-animation');
			});
		}

		// Hide 10% OFF
		const buttonElement = document.querySelector('button[aria-label="Open Form"]') as HTMLElement;
		if (buttonElement && buttonElement.style.display !== 'none') {
			buttonElement.style.display = 'none';
		}
	}

	async getOrder() {
		try {
			// const order_id = 333432; // for testing
			// this.promptCreateAccount = true;

			const order_id = localStorage.getItem('baskitsOrderId');
			this.promptCreateAccount = localStorage.getItem('baskitsCreatedAccount') ? true : false;

			// Base order data
			this.order = await this.ribon.bcGet(`/v2/orders/${order_id}`, {});

			// Customer data
			const { data: customer } = await this.ribon.bcGet(`/v3/customers`, { 'id:in': this.order.customer_id });
			this.customer = customer[0];

			this.accountForm.controls.email.setValue(this.customer?.email);

			// Consignments to map addresses back to products
			this.consignments = await this.ribon.bcGetAll(`/v2/orders/${order_id}/consignments`, {}, null, []);

			// Products data
			this.products = await this.ribon.bcGetAll(`/v2/orders/${order_id}/products`, {}, null, []);
			// Only show To, From, Note options
			this.products = this.products.map((product) => {
				product.product_options = product.product_options.filter((option) => {
					return ['To', 'From', 'Note'].includes(option.name);
				});
				const orderAddressId = product.order_address_id;
				const shippingAddress = this.consignments
					.flatMap((consignment) => consignment.shipping || []) // Flattening the shipping arrays
					.find((address) => address.id === orderAddressId);
				if (shippingAddress) {
					product.shipping_address = shippingAddress;
				}

				if (this.order.customer_message?.includes('_date') && shippingAddress?.id) {
					const ship_info = JSON.parse(this.order.customer_message);
					const date_info = ship_info.find((info) => info.shipping_address === shippingAddress.id);
					if (date_info) {
						product.delivery_date = moment(date_info.shipping_date).format('dddd MMMM Do, YYYY');
					}
				}
				return product;
			});

			// Fallback methods
			await this.checkCustomerNotes();

			this.loading = false;

			// console.log(this.order, this.customer, this.consignments, this.products);
		} catch (e) {
			console.log(e);
			this.loading = false;
		}
	}

	navigateToHome() {
		window.location.href = '/';
	}

	async savePassword() {
		try {
			if (this.accountForm.value.email && this.accountForm.value.password) {
				await this.ribon.bcPutPayload(`/v3/customers`, [
					{
						id: this.customer.id,
						authentication: {
							new_password: this.accountForm.value.password,
						},
					},
				]);
				this.createdAccount = true;
				localStorage.removeItem('baskitsCreatedAccount');
			}
		} catch (e) {
			console.log(e);
		}
	}

	async checkCustomerNotes() {
		try {
			// Back up for customer message
			if (!this.order.customer_message) {
				const shippingData = localStorage.getItem('shippingData');
				const shipping_addresses = await this.ribon.bcGet(`/v2/orders/${this.order.id}/shipping_addresses`, {});

				if (shippingData) {
					let shipJSON = JSON.parse(shippingData);
					shipJSON.map((sd) => {
						delete sd['checkout_id'];
						sd['order_id'] = this.order.id;
						sd['shipping_address'] = JSON.parse(sd['shipping_address']);
						return sd;
					});

					shipJSON.forEach((ship_item) => {
						const matchingAddress = shipping_addresses.find(
							(address) =>
								ship_item.shipping_address.address1 === address.street_1 && ship_item.shipping_address.city === address.city && ship_item.shipping_address.postalCode === address.zip
						);

						if (matchingAddress) {
							ship_item.shipping_address = matchingAddress.id;
						}
					});

					const payload = { customer_message: JSON.stringify(shipJSON) };
					// may need to update the payment method, sometimes gets a mapping Celigo doesnt accept
					if (this.order.payment_method.toLowerCase().includes('via adyen')) {
						payload['payment_method'] = 'Credit Card (Adyen)';
					}
					this.ribon.bcPut(`/v2/orders/${this.order.id}`, payload);
				}
			}

			if (!this.order.customer_id) {
				await this.updateCustomer();
			}
		} catch (e) {
			console.log(e);
		}
	}

	async updateCustomer() {
		try {
			// Update guest
			let customer;
			const email = this.order.billing_address.email;
			if (email) {
				customer = await this.ribon.bcGetAll(`/v3/customers`, { 'email:in': email });
				if (customer?.length) {
					customer = customer[0];
				} else {
					const new_account = {
						email: email,
						first_name: this.order.billing_address.first_name,
						last_name: this.order.billing_address.last_name,
					};

					const new_cust = await this.ribon.bcPostPayload(`/v3/customers`, [new_account]);
					if (new_cust?.data?.length) {
						customer = new_cust.data[0];
					}
				}

				if (customer?.id) {
					await this.ribon.bcPut(`/v2/orders/${this.order.id}`, { customer_id: customer.id }); // update order to have customer ID
				}
			}
		} catch (e) {
			console.log('ERROR', e);
		}
	}
}
