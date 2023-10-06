import { Component, OnInit, ViewChild, NgZone } from '@angular/core';
import { ConnectionService } from '../../services/connection.service';
import { CheckoutService } from '@app/services/checkout.service';
import { DynamicFormService } from '../../common/forms/dynamic-form.service';
import { Validators, FormGroup, FormBuilder, FormControl } from '@angular/forms';
import { WindowSize } from '../../common/helper/window-size-helper';
import { CustomerComponent } from './customer/customer.component';
import { ShippingComponent } from './shipping/shipping.component';
import { DeliveryComponent } from './delivery/delivery.component';
import { SummaryComponent } from './summary/summary.component';
import { PaymentComponent } from './payment/payment.component';
import { MatStepper } from '@angular/material/stepper';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
declare var window: any;

@Component({
	selector: 'baskits-checkout',
	templateUrl: './checkout.component.html',
	styleUrls: ['./checkout.component.scss'],
})
export class CheckoutComponent implements OnInit {
	@ViewChild('stepper') stepper: MatStepper;

	customerForm: FormGroup;
	addressForm: FormGroup;
	deliveryForm: FormGroup;
	summaryForm: FormGroup;
	paymentForm: FormGroup;

	formComponents = [
		{ name: 'customer', component: CustomerComponent, label: 'Sender', valid: this.isComponentValid(CustomerComponent), active: this.checkout.sections.customer.active },
		{ name: 'shipping', component: ShippingComponent, label: 'Message + Address', valid: this.isComponentValid(ShippingComponent), active: this.checkout.sections.shipping.active },
		{
			name: 'delivery',
			component: DeliveryComponent,
			label: this.checkout.isDelivery() ? 'Delivery Date' : 'Pickup Date',
			valid: this.isComponentValid(DeliveryComponent),
			active: this.checkout.sections.delivery.active,
		},
		{ name: 'summary', component: SummaryComponent, label: 'Summary', valid: this.isComponentValid(SummaryComponent), active: this.checkout.sections.summary.active },
		{ name: 'payment', component: PaymentComponent, label: 'Payment', valid: this.isComponentValid(PaymentComponent), active: this.checkout.sections.payment.active },
	];

	mobile: boolean = false;
	mobile_toggled: boolean = false;
	currentWindowSize: WindowSize;
	windowSize = WindowSize;

	constructor(
		public checkout: CheckoutService,
		private connection: ConnectionService,
		private formBuilder: FormBuilder,
		private df: DynamicFormService,
		private breakpointObserver: BreakpointObserver,
		private zone: NgZone
	) {
		breakpointObserver
			.observe([
				'(min-width: 1px) and (max-width: 991px)', // Including tablet now
			])
			.subscribe((result) => {
				// console.log('mobile', result.matches);
				if (result.matches) {
					this.mobile = true;
				} else {
					this.mobile = false;
				}
				this.zone.run(() => {});
			});
	}

	ngOnInit() {
		this.buildForms();
		// console.log('checkoutComponent init');
	}

	async ngAfterViewChecked() {
		// const elements = document.querySelectorAll('#baskits-checkout .mat-horizontal-stepper-header-container, .checkout-step button, .checkout-step a, .checkout-step h2, .checkout-step h3, .checkout-step .mat-radio-button, .checkout-step p, .checkout-step span, .checkout-step .mat-form-field');
		const elements = document.querySelectorAll(
			'#baskits-checkout .mat-horizontal-stepper-header-container, #baskits-checkout button, #baskits-checkout a, #baskits-checkout h2, #baskits-checkout h3, #baskits-checkout mat-hint, #baskits-checkout h4, #baskits-checkout h5, #baskits-checkout .mat-radio-button, #baskits-checkout p, #baskits-checkout span, #baskits-checkout .mat-form-field, #baskits-checkout img, #baskits-checkout .item-name, #baskits-checkout .mat-icon'
		);

		if (this.checkout.loading) {
			elements.forEach((element: HTMLElement) => {
				element.classList.add('skeleton-animation');
			});
		} else {
			elements.forEach((element: HTMLElement) => {
				element.classList.remove('skeleton-animation');
			});
		}

		this.formComponents.forEach((component, index) => {
			component.active = this.checkout.sections[component.name]?.active;
		});

		if (this.checkout.onlyGiftCertificatesInCart) {
			this.formComponents = this.formComponents.filter((component) => {
				return component.name !== 'shipping' && component.name !== 'delivery';
			});
		}

		if (window.moveToStep) {
			// console.log(window.moveToStep);

			switch (window.moveToStep) {
				// 	// These are already handled by checkout service
				// 	// case 'customer':
				// 	// 	this.stepper.selectedIndex = 0;
				// 	// 	break;
				// 	// case 'shipping':
				// 	// 	this.stepper.selectedIndex = 1;
				// 	// 	break;
				// 	case 'delivery':
				// 		this.checkout.sections.customer.active = false;
				// 		this.checkout.sections.shipping.active = false;
				// 		this.checkout.sections.delivery.active = true;
				// 		this.addressForm?.controls['isDone'].setValue(true);
				// 		await this.checkout.timeout(100); // Allows the animation to go through
				// 		this.stepper.selectedIndex = 2;
				// 		break;
				case 'summary':
					window.moveToStep = null;
					this.checkout.sections.customer.active = false;
					this.checkout.sections.shipping.active = false;
					this.checkout.sections.delivery.active = false;
					this.checkout.sections.summary.active = true;
					this.customerForm?.controls['isDone'].setValue(true);
					await this.checkout.timeout(100);
					this.stepper.next();
					window.moveToStep = null;
					break;

				// customerForm: FormGroup;
				// addressForm: FormGroup;
				// deliveryForm: FormGroup;
				// summaryForm: FormGroup;
				// paymentForm: FormGroup;

				// 	case 'payment':
				// 		this.checkout.sections.customer.active = false;
				// 		this.checkout.sections.shipping.active = false;
				// 		this.checkout.sections.delivery.active = true;
				// 		this.addressForm?.controls['isDone'].setValue(true);
				// 		await this.checkout.timeout(100); // Allows the animation to go through
				// 		this.stepper.selectedIndex = 4;
				// 		break;
				// 	default:
				// 		break;
			}
			// Reset
		}
	}

	private buildForms(): void {
		this.customerForm = this.formBuilder.group({
			isDone: new FormControl('', [Validators.required]),
		});

		this.summaryForm = this.formBuilder.group({
			isDone: new FormControl('', [Validators.required]),
		});

		this.paymentForm = this.formBuilder.group({
			isDone: new FormControl('', [Validators.required]),
		});

		if (!this.checkout.onlyGiftCertificatesInCart) {
			this.addressForm = this.formBuilder.group({
				isDone: new FormControl('', [Validators.required]),
			});

			this.deliveryForm = this.formBuilder.group({
				isDone: new FormControl('', [Validators.required]),
			});
		}
	}

	isComponentValid(component: any): boolean {
		if (component.component && component.component.formGroup) {
			return component.component.formGroup.valid;
		}
		return false;
	}

	getComponentIndex(component: any): number {
		// Find and return the index of the component in the formComponents array
		return this.formComponents.findIndex((c) => c === component);
	}

	getStepControl(component: any): any {
		switch (component.label) {
			case 'Sender':
				return this.customerForm;
			case 'Message + Address':
				return this.addressForm;
			case 'Delivery Date':
				return this.deliveryForm;
			case 'Summary':
				return this.summaryForm;
			case 'Payment':
				return this.paymentForm;
			default:
				return null;
		}
	}

	async handleStepChange(event: any) {
		const sections = ['customer', 'shipping', 'delivery', 'summary', 'payment'];
		const selectedStep = event.selectedIndex;

		for (let i = 0; i < sections.length; i++) {
			this.checkout.sections[sections[i]].active = i === selectedStep;
		}

		// Make sure they cant continue with invalid items if they go to summary
		if (selectedStep === 3) {
			if (this.checkout.isDelivery()) {
				// We have to select the consignment option for each
				// Pickup already had this done in shipping component
				for (const c of this.checkout.forms.consignmentsDatesOptions) {
					await this.checkout.service.selectConsignmentShippingOption(c.consignment_id, c.value.shipping_option.id);
					// console.log('selected option', c.consignment_id, c.value.shipping_option);
				}

				await this.checkout.refreshState(undefined, {
					include: `consignments.availableShippingOptions,cart.lineItems.physicalItems.options,cart.lineItems.digitalItems.options,customer,promotions.banners`,
				});
			}
		}

		await this.checkout.timeout(100); // allows the animation to get through
		this.stepper.selectedIndex = selectedStep;
	}

	isStepCompleted(component: any): boolean {
		switch (component.label) {
			case 'Sender':
				return this.customerForm.valid;
			case 'Message + Address':
				return this.addressForm.valid;
			case 'Delivery Date':
				return this.deliveryForm.valid;
			case 'Summary':
				return this.summaryForm.valid;
			case 'Payment':
				return this.paymentForm.valid;
			default:
				return false;
		}
	}
}
