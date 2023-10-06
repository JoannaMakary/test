import { Component, OnInit, ViewChild } from '@angular/core';
import { CheckoutService } from '@service/checkout.service';
import { Validators } from '@angular/forms';
import { DynamicFormService } from '../../../common/forms/dynamic-form.service';
import * as moment from 'moment';
import { DialogService } from '@common/notification/dialog/dialog.service';
import { CheckoutComponent } from '../checkout.component';
import { RibonService } from '@app/services/ribon.service';
import { PaymentService } from '@app/services/payment.service';
import { CalendarService } from '@app/services/calendar.service';
declare var window: any;

@Component({
	selector: 'checkout-payment',
	templateUrl: './payment.component.html',
	styleUrls: ['./payment.component.scss'],
})
export class PaymentComponent implements OnInit {
	creditcard: any;
	activeGateway: any;
	standardGatewayId = 'scheme';
	amexGatewayId = 'authorizenet';
	profiles: any = [];
	selectedMethod: any = {};
	updatedBilling: boolean = false;
	years: any = [];
	months: any = [];
	cc_mask: any = [/\d/, /\d/, /\d/, /\d/, '-', /\d/, /\d/, /\d/, /\d/, '-', /\d/, /\d/, /\d/, /\d/, '-', /\d/, /\d/, /\d/, /\d/];
	expiration_mask: any = [/\d/, /\d/, '/', /\d/, /\d/];
	creditcard_inputs: any = [
		{
			field: 'ccNumber',
			name: 'Credit Card Number',
			type: 'text',
			size_class: 'full',
			validator: Validators.compose([Validators.required, Validators.pattern('^[0-9]{4}-?[0-9]{4}-?[0-9]{4}-?[0-9]{3,4}_?$')]),
			error: 'Please enter a valid card number.',
		},
		{
			field: 'ccCvv',
			name: 'CVV',
			type: 'text',
			size_class: 'full',
			validator: Validators.compose([Validators.required, Validators.pattern('^[0-9]{3,4}$')]),
			error: 'Please enter the CVV on your card.',
		},
		// { field: 'ccExpiry', name: 'Credit Expiry', type: 'text', size_class: 'full', validator: Validators.compose([Validators.required, Validators.pattern('^[0-9]{2}(.{1})[0-9]{2}$')])},
		{
			field: 'ccExpiryMonth',
			name: 'Credit Expiry Month',
			type: 'text',
			size_class: 'full',
			validator: Validators.compose([Validators.required]),
			error: 'Please enter a valid card expiry date.',
		},
		{ field: 'ccExpiryYear', name: 'Credit Expiry Year', type: 'text', size_class: 'full', validator: Validators.compose([Validators.required]), error: 'Please enter a valid card expiry date.' },
		{
			field: 'ccName',
			name: 'Name on Card',
			type: 'text',
			size_class: 'full',
			validator: Validators.compose([Validators.required, Validators.pattern("^[0-9a-zA-ZàáâäãåąčćęèéêëėįìíîïłńòóôöõøùúûüųūÿýżźñçčšžÀÁÂÄÃÅĄĆČĖĘÈÉÊËÌÍÎÏĮŁŃÒÓÔÖÕØÙÚÛÜŲŪŸÝŻŹÑßÇŒÆČŠŽ∂ð ,.'-]+$")]),
			error: 'Please enter the name on the card.',
		},
		{ field: 'ccType', name: 'Credit Card Type', type: 'text', size_class: 'full', validator: Validators.required },
		{ field: 'profile', name: 'Save Credit Card', type: 'text', size_class: 'full' },
		{ field: 'saveCC', name: 'Save Credit Card', type: 'text', size_class: 'full' },
	];
	initGooglePay: boolean = false;
	googleSignedIn: boolean = false;
	customer_orders: any = [];

	constructor(
		public checkout: CheckoutService,
		private df: DynamicFormService,
		private dialog: DialogService,
		public cc: CheckoutComponent,
		private ribon: RibonService,
		public pay: PaymentService,
		private calendar: CalendarService
	) {}

	async ngOnInit() {
		this.checkout.scrollToTop();

		if (
			(!this.checkout.onlyGiftCertificatesInCart && !this.checkout.forms.consignmentsDatesOptions.length) ||
			!this.checkout.forms.consignmentsDatesOptions.every((form) => form.valid) ||
			!this.checkout.checkout.consignments.every((consignment) => consignment.selectedShippingOption?.id)
		) {
			this.checkout.sections.delivery.active = true;
			this.checkout.sections.payment.active = false;
			this.checkout.sections.summary.active = false;

			await this.checkout.timeout(100); // Allows the animation to go through
			this.cc.stepper.selectedIndex = 2; // Go back to delivery
		} else {
			this.checkout.sections.payment.active = true;
		}

		if (this.checkout.checkout.customer.id) {
			await this.getPreviousOrders();
		}

		this.getMethods();
		this.getProfiles();

		let testing = {};
		if (window.location.href.indexOf('testing') > -1) {
			testing = {
				ccNumber: `4030-0000-1000-1234`,
				// ccNumber: `4123-4501-3100-3312`, // 3ds card
				ccCvv: `123`,
				ccExpiry: `02/23`,
				ccExpiryMonth: '02',
				ccExpiryYear: 2023,
				ccType: 'VISA',
				ccName: `Testing`,
			};
		}

		this.creditcard = this.df.createForm(this.creditcard_inputs, testing);

		// generate the years
		let year = parseFloat(moment().format('YYYY'));
		for (let y = year; y < year + 8; y++) {
			this.years.push(y);
		}

		// generate the months
		for (let m = 0; m < 12; m++) {
			this.months.push({
				long: moment().month(m).format('MMMM'),
				short: moment().month(m).format('MMM'),
				number: moment().month(m).format('MM'),
			});
		}
	}

	async getPreviousOrders() {
		try {
			this.customer_orders = await this.ribon.bcGet('/v2/orders', { customer_id: this.checkout.checkout.customer.id, sort: 'date_created:desc' });
		} catch (e) {
			console.log(e);
		}
	}

	async getMethods() {
		if (!this.checkout.payment_methods?.length) {
			// if for some reason they didn't initialize
			await this.checkout.getPaymentMethods();
		}

		const adyenMethod = this.checkout.payment_methods.find((m) => m.gateway?.includes('adyen'));
		if (adyenMethod) {
			this.standardGatewayId = adyenMethod.id;
		}

		if (this.checkout.payment_methods.length === 1 && this.checkout.payment_methods[0]?.initializationData?.card_information) {
			this.googleSignedIn = true;
			this.initGooglePay = true;
		}

		// Auto-select first method
		this.selectMethod(this.checkout.payment_methods[0]);

		// Auto-select the first billing address
		if (!this.checkout.billingAddress.value.address1 && this.checkout.customerAddresses.length) {
			if (this.customer_orders.length) {
				const matching_address = this.checkout.customerAddresses.find((address) => {
					return (
						address.address1 === this.customer_orders[0].billing_address.street_1 &&
						address.address2 === this.customer_orders[0].billing_address.street_2 &&
						address.firstName === this.customer_orders[0].billing_address.first_name &&
						address.lastName === this.customer_orders[0].billing_address.last_name &&
						address.postalCode === this.customer_orders[0].billing_address.zip
					);
				});
				if (matching_address) {
					this.checkout.billingAddress.patchValue(matching_address);
				} else {
					this.checkout.billingAddress.patchValue(this.checkout.customerAddresses[0]);
				}
			} else {
				this.checkout.billingAddress.patchValue(this.checkout.customerAddresses[0]);
			}
		}
	}

	getActiveGateway(): string {
		const amexSuffix = '-AMEX';
		const isAmexOrder = this.checkout.checkout.cart.lineItems.physicalItems.some((i) => {
			return i.sku.indexOf(amexSuffix, i.sku.length - amexSuffix.length) !== -1;
		});
		return isAmexOrder ? this.amexGatewayId : this.standardGatewayId;
	}

	selectMethod(method) {
		this.checkout.misc.controls.payment_method.setValue('');
		this.checkout.misc.controls.payment_method.setValue(method);
		this.selectedMethod = method;
	}

	updateType() {
		const value = this.creditcard.controls.ccNumber.value.replace(/[^\d/]/g, '').toString();
		// console.log('cc-value', value);

		const cards = [
			{
				card_class: 'fa-cc-amex',
				card_type: 'AMEX',
				regex: '^3[47]',
			},
			{
				card_class: 'fa-cc-discover',
				card_type: 'DISCOVER',
				regex: '^(6011|622(12[6-9]|1[3-9][0-9]|[2-8][0-9]{2}|9[0-1][0-9]|92[0-5]|64[4-9])|65)',
			},
			{
				card_class: 'fa-cc-mastercard',
				card_type: 'MC',
				regex: '^5[1-5]',
			},
			{
				card_class: 'fa-cc-visa',
				card_type: 'VISA',
				regex: '^4',
			},
		];

		if (value && value.length > 4) {
			for (let c = 0; c < cards.length; c++) {
				const card = cards[c];
				const rgx = new RegExp(card.regex);

				if (value.match(rgx)) {
					this.creditcard.controls.ccType.setValue(card.card_type);
				}
			}
		}
	}

	async getProfiles() {
		this.checkout.state = await this.checkout.service.loadInstruments();
		let profiles = this.checkout.state.data.getInstruments();
		// console.log('profiles', profiles);
	}

	selectProfile() {
		if (this.creditcard.controls.profile.value && this.creditcard.controls.profile.value.type) {
			let value = this.creditcard.controls.profile.value.type.toUpperCase();
			switch (value) {
				case 'AMERICAN EXPRESS':
					value = 'AMEX';
					break;
				case 'MASTERCARD':
					value = 'MC';
					break;
				default:
			}
			// console.log('VALUE', value);
			this.creditcard.controls.ccType.setValue(value);
		}
	}

	isPayPal(method): boolean {
		if (method?.config?.displayName?.toLowerCase().includes('paypal')) {
			return true;
		} else {
			return false;
		}
	}

	isGooglePay(method): boolean {
		if (method?.config?.displayName?.toLowerCase().includes('google')) {
			return true;
		} else {
			return false;
		}
	}

	isValidOrder(): boolean {
		if (this.checkout.misc.controls.payment_method.value) {
			// if (this.checkout.misc.controls.payment_method.value.method !== 'offline' && !this.creditcard.valid) {
			// 	return false;
			// } else {
			return true;
			// }
		} else {
			return false;
		}
	}

	isValidBilling(): boolean {
		// We are mapping these at this point as we need to have accurate billing information
		this.checkout.billingAddress.value['email'] = this.checkout.customerEmail ? this.checkout.customerEmail : this.checkout.checkout.cart.email;

		if (!this.checkout.billingAddress.value.countryCode && this.checkout.billingAddress.value.country) {
			this.checkout.billingAddress.value.countryCode = this.checkout.countries.billing.find((country) => country.name === this.checkout.billingAddress.value.country)?.code;
		}

		if (!this.checkout.billingAddress.value.stateOrProvinceCode && this.checkout.billingAddress.value.stateOrProvince) {
			this.checkout.billingAddress.value.stateOrProvinceCode = this.checkout.countries.billing
				?.find((country) => country.name === this.checkout.billingAddress.value.country)
				?.subdivisions?.find((province) => province.name === this.checkout.billingAddress.value.stateOrProvince.replaceAll('é', 'e'))?.code;
		}

		return this.checkout.billingAddress.valid && this.checkout.isValidBilling();
	}

	getGatewayContainerClass(method: any): string {
		const selectedMethod = this.checkout.misc.controls.payment_method.value;
		if (selectedMethod && selectedMethod.id === method.id) {
			return 'active';
		} else if (!selectedMethod || selectedMethod === '') {
			return 'not-selected';
		} else {
			return '';
		}
	}

	isSelectedMethod(method: any): boolean {
		const selectedMethod = this.checkout.misc.controls.payment_method.value;
		return selectedMethod && selectedMethod.id === method.id;
	}

	shouldShowHelpIcon(method: any): boolean {
		return method.id === 'paypalexpress' || method.id === 'paypalcommerce';
	}

	getTooltipText(method: any): string {
		if (method.id === 'paypalexpress' || method.id === 'paypalcommerce') {
			return 'Link your debit card or credit card with PayPal, and securely checkout by logging into your account and confirming payment';
		} else {
			return '';
		}
	}

	shouldShowNewCardBox(method: any): boolean {
		return this.profiles.length === 0 || (this.profiles.length > 0 && this.creditcard.controls.profile.value === '');
	}

	shouldShowNewCard(method: any): boolean {
		return (
			!this.selectedMethod?.gateway?.includes('adyen') &&
			this.selectedMethod?.supportedCards &&
			this.selectedMethod?.supportedCards.length > 0 &&
			this.selectedMethod?.id === this.standardGatewayId &&
			this.selectedMethod?.id === method.id
		);
	}

	shouldShowCreditCardBox(method: any): boolean {
		return this.selectedMethod?.gateway?.includes('adyen') && this.creditcard;
	}

	shouldShowSaveCard(method: any): boolean {
		return method.config?.isVaultingEnabled && this.selectedMethod?.id === method.id;
	}

	shouldDisableTooltip(method: any): boolean {
		return method.id !== 'paypalexpress' && method.id !== 'paypalcommerce';
	}

	async placeOrder() {
		const $this = this;

		this.checkout.paymentLoading = true;

		const validDates = this.isValidDates();

		if (!validDates || !this.calendar.validDeliveryOptions) {
			this.checkout.paymentLoading = false;
			return false;
		}

		if (this.calendar.validDeliveryOptions) {
			const billingShippingMatchIndex = this.checkout.isBillingShippingMatch();

			if (billingShippingMatchIndex > -1) {
				let dialogText = '<p>We noticed your billing address is the same as the shipping address you entered.</p>';
				dialogText += '<p>Are you sure you want to continue?</p>';
				this.dialog.showConfirmationdialog('Hey!', dialogText, 'Yes', 'No').subscribe(function (res) {
					if (!res) {
						$this.checkout.paymentLoading = false;
						return false;
					} else {
						processPayment();
					}
				});
			} else {
				processPayment();
			}

			async function processPayment() {
				try {
					window._loq = window._loq || []; // ensure queue available
					window._loq.push(['tag', 'Credit-Card-Checkout']); // Custom tag LO

					if (!$this.updatedBilling) {
						$this.checkout.state = await $this.checkout.service.updateBillingAddress($this.checkout.billingAddress.value);
						$this.updatedBilling = true;
					}

					// Validate method
					const method = $this.checkout.misc.controls.payment_method.value;

					if (method) {
						const response = await $this.pay.initializePayment(method, $this.creditcard.value);

						if (response) {
							localStorage.setItem('baskitsOrderId', $this.checkout.order.orderId);
							window.location.href = '/checkout/order-confirmation';
							$this.checkout.paymentSuccess = true;
						} else {
							$this.reinitializePayment();
							$this.dialog.showDialogError(
								'Something went wrong!',
								"An error occurred while processing your payment, please check your payment details and try again.<br><br>Please feel free to contact us if you are experiencing issues <a href='mailto:help@baskits.com'>help@baskits.com</a> / <a href='tel:18005619177'>1-800-561-9177</a>."
							);
						}
					}

					$this.checkout.paymentLoading = false;
				} catch (e) {
					$this.dialog.showDialogError(
						'Something went wrong!',
						"An error occurred while processing your payment, please check your payment details and try again.<br><br>Please feel free to contact us if you are experiencing issues <a href='mailto:help@baskits.com'>help@baskits.com</a> / <a href='tel:18005619177'>1-800-561-9177</a>."
					);
					$this.reinitializePayment();
					$this.checkout.paymentLoading = false;
				}
			}
		}
	}

	addressEquals(a1, a2) {
		let matchingAddress = true;
		const fieldsToIgnore = ['email', 'customFields', 'type', 'id', 'stateOrProvinceCode', 'shouldSaveAddress'];
		for (const field of Object.keys(a1)) {
			// if property is null, convert to empty string so it can be evaluated
			if (a1[field] === null || a1[field] === undefined) a1[field] = '';
			if (a2[field] === null || a2[field] === undefined) a2[field] = '';
			// compare the values (ignore certain fields)
			if (a1[field] !== a2[field] && fieldsToIgnore.indexOf(field) === -1) {
				matchingAddress = false;
			}
		}
		return matchingAddress;
	}

	async reinitializePayment() {
		if (this.checkout.initializedPayment) {
			let response = await this.checkout.service.deinitializePayment({ methodId: this.checkout.initializedPayment });
			// console.log('Reinit', this.checkout.initializedPayment, response);
			// Reselect the payment
			const selectedPayment = this.checkout.payment_methods.find((method) => method.id === this.checkout.initializedPayment);
			this.selectMethod('');
			await this.checkout.timeout(500);
			this.selectMethod(selectedPayment);
		}
	}

	async isValidDates() {
		this.calendar.validateUserDates();

		if (this.calendar.validDeliveryOptions) {
			return true;
		} else {
			// Need to force them back to the calendar and show a message
			this.checkout.timedOutDates = true;
			this.checkout.sections.delivery.active = true;
			this.checkout.sections.payment.active = false;
			this.checkout.sections.summary.active = false;
			this.cc.deliveryForm.controls['isDone'].setValue(false);
			this.cc.summaryForm.controls['isDone'].setValue(false);
			this.cc.paymentForm.controls['isDone'].setValue(false);
			await this.checkout.timeout(100); // Allows the animation to go through
			this.cc.stepper.selectedIndex = 2; // Go back to delivery
			return false;
		}
	}
}
