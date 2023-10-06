import { Component, OnInit } from '@angular/core';
import { CheckoutService } from '@app/services/checkout.service';

@Component({
	selector: 'payment-adyen',
	templateUrl: './adyen.component.html',
	styleUrls: ['./adyen.component.scss'],
})
export class AdyenComponent implements OnInit {
	public containerId = 'adyen-dropin-container';
	private methodId;
	public missingMethod = false;
	private adyenPaymentMethod;
	constructor(private checkout: CheckoutService) {}

	async ngOnInit() {
		const state = await this.checkout.service.loadPaymentMethods();
		const bcPaymentMethods = state.data.getPaymentMethods();
		this.adyenPaymentMethod = bcPaymentMethods.find((method) => method.gateway.includes('adyen'));
		this.methodId = this.adyenPaymentMethod.id;

		if (!this.adyenPaymentMethod) {
			return (this.missingMethod = true);
		}

		if (this.checkout.initializedPayment) {
			let response = await this.checkout.service.deinitializePayment({ methodId: this.checkout.initializedPayment });
			// console.log('deinit', this.checkout.initializedPayment, response);
		}

		this.initializeAdyen();
	}

	async initializeAdyen() {
		try {
			// console.log('initiate adyen', this.methodId, this.containerId);

			this.checkout.state = await this.checkout.service.initializePayment({
				methodId: this.methodId,
				adyenv3: {
					containerId: this.containerId,
					options: { hasHolderName: true, holderNameRequired: true },
				},
			});

			this.checkout.initializedPayment = this.methodId;

			// console.log('adyen initialized');
		} catch (e) {
			console.log(e);
		}
	}
}
