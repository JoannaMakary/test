import { Component, OnInit, ViewChild } from '@angular/core';
import { DynamicFormService } from '@common/forms/dynamic-form.service';
import { CheckoutService } from '@app/services/checkout.service';

@Component({
	selector: 'checkout-billing',
	templateUrl: './billing.component.html',
	styleUrls: ['./billing.component.scss'],
})
export class BillingComponent implements OnInit {
	@ViewChild('checkoutAddress', { static: false }) checkoutAddress: any;

	constructor(private df: DynamicFormService, public checkout: CheckoutService) {}

	ngOnInit(): void {}
}
