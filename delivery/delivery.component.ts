import { Component, OnInit } from '@angular/core';
import { CheckoutService } from '@app/services/checkout.service';
import { RibonService } from '@app/services/ribon.service';
import { CartService } from '@app/services/cart.service';
import { CheckoutComponent } from '../checkout.component';
import { CalendarService } from '@app/services/calendar.service';
import { DynamicFormService } from '@common/forms/dynamic-form.service';
import { DialogService } from '@common/notification/dialog/dialog.service';
import * as moment from 'moment';

@Component({
	selector: 'checkout-delivery',
	templateUrl: './delivery.component.html',
	styleUrls: ['./delivery.component.scss'],
})
export class DeliveryComponent implements OnInit {
	constructor(
		public checkout: CheckoutService,
		private ribon: RibonService,
		public cc: CheckoutComponent,
		private cart: CartService,
		public calendar: CalendarService,
		private df: DynamicFormService,
		private dialog: DialogService
	) {}

	async ngOnInit() {
		try {
			this.checkout.loading = true;

			if (this.checkout.shipping_options.length === this.checkout.checkout.consignments.length) {
				this.checkout.createConsignmentForms(true);
				this.calendar.calculateMinDates();
				await this.checkout.timeout(1000); // Not sure what is actually scrolling the user down here...
				this.checkout.scrollToTop();
			} else {
				this.dialog.showDialogError(
					'Something went wrong!',
					"An error occurred while processing your shipping address(es), please check your address details and try again.<br><br>Please feel free to contact us if you are experiencing issues <a href='mailto:help@baskits.com'>help@baskits.com</a> / <a href='tel:18005619177'>1-800-561-9177</a>."
				);
				this.cc.addressForm?.controls['isDone'].setValue(false);
				await this.checkout.timeout(100); // Allows the animation to go through
				this.cc.stepper.previous();
			}

			this.checkout.loading = false;
		} catch (e) {
			console.log(e);
			this.checkout.loading = false;
		}
	}

	async proceedToSummary() {
		try {
			this.checkout.loading = true;

			if (this.checkout.isDelivery()) {
				// We have to select the consignment option for each
				// Pickup already had this done in shipping component
				for (const c of this.checkout.forms.consignmentsDatesOptions) {
					await this.checkout.service.selectConsignmentShippingOption(c.consignment_id, c.value.shipping_option.id);
					console.log('selected option', c.consignment_id, c.value.shipping_option);
				}

				await this.checkout.refreshState(undefined, {
					include: `consignments.availableShippingOptions,cart.lineItems.physicalItems.options,cart.lineItems.digitalItems.options,customer,promotions.banners`,
				});
			}

			if (
				this.checkout.forms.consignmentsDatesOptions.length &&
				this.checkout.forms.consignmentsDatesOptions.every((form) => form.valid) &&
				this.checkout.checkout.consignments.every((consignment) => consignment.selectedShippingOption?.id)
			) {
				this.checkout.sections.delivery.active = false;
				this.checkout.sections.summary.active = true;
				this.cc.deliveryForm?.controls['isDone'].setValue(true);
				await this.checkout.timeout(100); // Allows the animation to go through
				this.cc.stepper.next();
			}
			this.checkout.loading = false;
		} catch (e) {
			console.log(e);
			this.checkout.loading = false;
		}
	}

	isSelectedMethod(method: any, consignDateOption): boolean {
		if (method === consignDateOption.value.shipping_option) {
			return true;
		} else {
			return false;
		}
	}
}
