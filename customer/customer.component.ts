import { Component, OnInit } from '@angular/core';
import { FormGroup, Validators } from '@angular/forms';
import { DynamicFormService } from '@common/forms/dynamic-form.service';
import { CheckoutService } from '@app/services/checkout.service';
import { CheckoutComponent } from '../checkout.component';
import { RibonService } from '@app/services/ribon.service';

@Component({
	selector: 'checkout-customer',
	templateUrl: './customer.component.html',
	styleUrls: ['./customer.component.scss'],
})
export class CustomerComponent implements OnInit {
	error: any = false;
	loginPrompted: boolean = false;
	loginForm: FormGroup;
	loginFormTemplate = [
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
		{ field: 'password', name: 'Password', type: 'password', size_class: 'full', validator: Validators.required },
		{ field: 'email_opt_in', name: 'Sign up for our emails', type: 'checkbox', size_class: 'full' },
	];

	constructor(public checkout: CheckoutService, private df: DynamicFormService, public cc: CheckoutComponent, private ribon: RibonService) {}

	ngOnInit() {
		this.checkout.scrollToTop();

		this.loginForm = this.df.createForm(this.loginFormTemplate, {});
		// console.log('customerComponent init', this.checkout.sections);

		if (this.checkout?.customer?.email) {
			this.loginPrompted = true;
			this.loginForm.controls.email.setValue(this.checkout.customer.email);
			this.loginForm.controls.password.setValue('passwordpasswordpasswordpasswordpasswordpasswordpasswordpasswordpasswordpassword'); // shows the user they're already logged in
			// If the user already chose to continue as a guest, email is saved. Skip to shipping
		} else if (this.checkout?.customer?.isGuest && this.checkout?.checkout?.billingAddress?.email) {
			this.loginForm.controls.email.setValue(this.checkout.checkout?.billingAddress?.email);
		}

		// If the user was already logged in, skip to shipping
		// Only on initialization because we want to let them go back to the step if they want to
		if (this.checkout.sections.customer.valid && !this.checkout.checkoutInitialized) {
			this.checkout.checkoutInitialized = true;
			this.proceedToShipping();
		}
	}

	// async customerLookup() {
	// 	if (!this.loginForm.controls.email.valid) {
	// 		return;
	// 	}

	// 	try {
	// 		this.checkout.loading = true;

	// 		const email = this.loginForm.controls.email.value;
	// 		const customer_exists = await this.checkout.getCustomerByEmail(email);

	// 		if (!customer_exists) {
	// 			this.error = 'No customer exists with that email address. Please try again.'; // Give a more concise message
	// 		} else {
	// 			this.loginPrompted = true;
	// 			await this.checkout.timeout(50); // Doesnt want to clear right away
	// 			this.loginForm.controls['password'].setValue('');
	// 			this.loginForm.controls['password'].setErrors(null); // Clear password error
	// 		}

	// 		this.checkout.loading = false;
	// 	} catch (e) {
	// 		console.log(e);
	// 		this.error = e;
	// 		this.checkout.loading = false;
	// 	}
	// }

	toggleLogin() {
		this.loginPrompted = !this.loginPrompted;
		this.error = '';
	}

	async continueAsGuest() {
		if (!this.loginForm.controls.email.valid) {
			this.loginForm.controls.email.markAsTouched();
			return;
		}

		try {
			this.checkout.loading = true;

			if (this.checkout.customer.email) {
				// sign them out first
				this.checkout.state = await this.checkout.service.signOutCustomer();
			}

			this.checkout.state = await this.checkout.service.continueAsGuest({ email: this.loginForm.controls.email.value });

			this.proceedToShipping();

			this.checkout.loading = false;
		} catch (e) {
			console.log(e);
			this.error = e;
			this.checkout.loading = false;
		}
	}

	async signInCustomer(form: FormGroup) {
		if (!form.valid) return false;

		try {
			this.checkout.loading = true;

			this.checkout.state = await this.checkout.service.signInCustomer({ email: form.value.email, password: form.value.password });

			await this.checkout.refreshState();

			this.checkout.state = await this.checkout.service.loadCheckout();
			// this.checkout.checkout = await this.checkout.state.data.getCheckout();
			this.checkout.customer = await this.checkout.state.data.getCustomer();

			this.checkout.getCustomerAddresses();

			this.proceedToShipping();

			this.checkout.loading = false;
		} catch (e) {
			console.log(e);
			e = e.toString();

			if (e.includes('Invalid login attempt')) {
				this.error = 'Invalid login attempt. Please try again.';
			} else {
				this.error = e;
			}

			this.checkout.loading = false;
		}
	}

	async updateGuestSession() {
		this.checkout.misc.controls.email_opt_in.value = this.loginForm.controls.email_opt_in.value;
		try {
			await this.ribon.createKlaviyoCustomer(this.loginForm.controls.email.value);
			console.log('subscribed');
		} catch (e) {
			console.log(e);
		}
	}

	async proceedToShipping() {
		this.checkout.customerEmail = this.loginForm.controls.email.value;
		this.checkout.sections.customer.active = false;
		this.checkout.sections.shipping.active = true;
		this.cc.customerForm.controls['isDone'].setValue(true);
		await this.checkout.timeout(100); // Allows the animation to go through
		this.cc.stepper.next();
	}
}
