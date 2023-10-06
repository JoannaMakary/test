import { Component, OnInit } from '@angular/core';
import { CheckoutService } from '@app/services/checkout.service';
import { ConnectionService } from '@app/services/connection.service';
declare var window: any;

@Component({
	selector: 'adyen-googlepay',
	templateUrl: './adyen-googlepay.component.html',
	styleUrls: ['./adyen-googlepay.component.scss'],
})
export class AdyenGooglePayComponent implements OnInit {
	public containerId = 'adyen-google-dropin-container';
	public missingMethod = true;
	private methodId = 'googlepayadyenv3';
	public googlePaymentMethod: any;
	public googleSignedIn = false;

	constructor(private checkout: CheckoutService, private connection: ConnectionService) {}

	async ngOnInit() {
		if (this.checkout.initializedPayment) {
			let response = await this.checkout.service.deinitializePayment({ methodId: this.checkout.initializedPayment });
			// console.log('deinit', this.checkout.initializedPayment, response);
		}

		if (this.checkout.misc.value?.payment_method?.id === this.checkout.googlePayMethod) {
			const state = await this.checkout.service.loadPaymentMethods();
			const bcPaymentMethods = state.data.getPaymentMethods();
			this.googlePaymentMethod = bcPaymentMethods.find((m) => m.id === this.checkout.googlePayMethod);

			if (this.googlePaymentMethod) this.missingMethod = false;
			if (this.googlePaymentMethod?.initializationData?.card_information) {
				this.googleSignedIn = true;
			}

			try {
				this.checkout.loading = true;
				// no point of running this again if they're not on payment. and avoids the infinite load error.
				if (document.getElementById('googlepay-button')) {
					await this.checkout.service.initializePayment({
						methodId: this.checkout.googlePayMethod,
						googlepayadyenv3: {
							containerId: this.containerId,
							walletButton: 'googlepay-button',
							onError(error) {
								console.log('gpay response error', error);
								window.location.reload();
							},
							onPaymentSelect: this.onPaymentSelect(this),
						},
					});

					this.checkout.initializedPayment = this.methodId;
					// console.log('init google pay');
				} else {
					let response = await this.checkout.service.deinitializePayment({
						methodId: this.checkout.googlePayMethod,
					});
					// console.log('deinit google pay', response, this.checkout.googlePayMethod);
				}
				this.checkout.loading = false;
				const state = await this.checkout.service.loadPaymentMethods();
				const bcPaymentMethods = state.data.getPaymentMethods('googlepayadyenv3');
			} catch (e) {
				// console.log(this.googlePaymentMethod.id, e);
			}
		}
	}

	async onPaymentSelect(context) {
		window._loq = window._loq || []; // ensure queue available
		window._loq.push(['tag', 'Google-Pay-Checkout']); // Custom tag LO

		if (context.checkout) {
			context.checkout.loading = true;
		}

		if (context.googlePaymentMethod?.initializationData?.card_information) {
			context.googleSignedIn = true;
		}

		if (context.checkout) {
			context.checkout.loading = false;
		}
	}

	async signOut() {
		try {
			this.checkout.loading = true;
			this.checkout.signOutGoogle = true;
			// console.log('de-initialized google pay');
			await this.checkout.service.deinitializePayment({ methodId: this.methodId }).then(async () => {
				const state = await this.checkout.service.loadPaymentMethods();
				const bcPaymentMethods = state.data.getPaymentMethods();
				// console.log('methods after de-init googlepay', bcPaymentMethods);
				await this.connection.post('/remote-checkout/forget-checkout', {}).subscribe(
					(response) => {
						window.location.reload();
					},
					(err) => {
						return err;
					}
				);
				window.location.reload();

				this.checkout.loading = false;
			});
		} catch (error) {
			console.log(error);
			if (error?.type && error?.type === 'checkout_not_available') {
				window.location.reload();
			}
		}
	}
}
