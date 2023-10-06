import { Component, OnInit } from '@angular/core';
import { CheckoutService } from '@service/checkout.service';
import { CheckoutComponent } from '../checkout.component';
import * as moment from 'moment';
import { DialogService } from '@common/notification/dialog/dialog.service';
import { CalendarService } from '@app/services/calendar.service';

@Component({
	selector: 'checkout-summary',
	templateUrl: './summary.component.html',
	styleUrls: ['./summary.component.scss'],
})
export class SummaryComponent implements OnInit {
	products: any;
	rows = [];
	constructor(public checkout: CheckoutService, public cc: CheckoutComponent, private dialog: DialogService, private calendar: CalendarService) {}

	async ngOnInit() {
		this.checkout.scrollToTop();

		// Store dates
		// const serializedData = this.checkout.forms.consignmentsDatesOptions.map((formGroup) => this.checkout.removeCircularReferences(formGroup));
		// const consignJSON = JSON.stringify(serializedData, null, 2);
		// this.checkout.ls.set('consignmentsDatesOptions', consignJSON);
		if (
			!this.checkout.onlyGiftCertificatesInCart &&
			(!this.checkout.forms.consignmentsDatesOptions.length ||
				!this.checkout.forms.consignmentsDatesOptions.every((form) => form.valid) ||
				!this.checkout.checkout.consignments.every((consignment) => consignment.selectedShippingOption?.id))
		) {
			this.checkout.sections.delivery.active = true;
			this.checkout.sections.summary.active = false;
			await this.checkout.timeout(100); // Allows the animation to go through
			this.cc.stepper.previous();
		} else if (this.checkout.onlyGiftCertificatesInCart) {
			this.checkout.sections.summary.active = true;
		}

		try {
			const shippingData = await this.checkout.getShippingData(null, this.checkout.checkout.consignments);
			console.log('SHIPPING DATA', shippingData);
		} catch (e) {
			console.log(e);
		}
	}

	ngDoCheck() {
		if ((!this.rows.length && this.checkout.products.length) || this.checkout.onlyGiftCertificatesInCart) {
			this.populateTableRows();
		}
	}

	populateTableRows() {
		this.rows = this.checkout.items.map((item) => {
			if (item.type !== 'giftCertificate') {
				const product = this.checkout.products.find((p) => p.id === item.productId);
				item.product = product;

				const matching_consignment = this.checkout.checkout.consignments.find((c) => c.lineItemIds.includes(item.id));
				const matching_consign_form = this.checkout.forms.consignmentsDatesOptions.find((f) => f.consignment_id === matching_consignment?.id);
				const matching_line_form = this.checkout.forms.lineItems.find((f) => f.details.id === item.id);

				if (matching_consignment && matching_consign_form) {
					item.address = matching_consignment.address;
					if (this.checkout.isDelivery()) {
						item.shipping_method = matching_consign_form.value.shipping_option;
					}

					if (matching_consign_form['upsStandardRange'] || matching_consign_form['upsExpressRange']) {
						item.isLocalDelivery = false;
						// Show the range
						const currentDate = moment(matching_consign_form.value.delivery_date).tz(moment.tz.guess());
						// We set the delivery range to the calculated day + 1 day
						const nextDay = moment(currentDate).tz(moment.tz.guess()).add(1, 'day');

						while (this.calendar.isBlackoutDay(nextDay.format('YYYY-MM-DD'))) {
							nextDay.add(1, 'day');
						}

						item.delivery_date = `${currentDate.format('ddd MMMM Do')} - ${nextDay.format('ddd MMMM Do, YYYY')}`;
					} else {
						item.isLocalDelivery = true;
						item.delivery_date = moment(matching_consign_form.value.delivery_date).tz(moment.tz.guess()).format('dddd, MMMM Do, YYYY');
					}
				} else {
					this.dialog.showDialogError(
						'Something went wrong!',
						"An error occurred while getting a summary of your order.<br><br>Please feel free to contact us if you are experiencing issues <a href='mailto:help@baskits.com'>help@baskits.com</a> / <a href='tel:18005619177'>1-800-561-9177</a>."
					);
				}

				if (matching_line_form) {
					item.buildProduct = matching_line_form.details.buildProduct;
					if (matching_line_form.buildProducts?.total) {
						item.buildTotal = matching_line_form.buildProducts.total;
					}
				}
			} else {
				item.options = [];
				item.options.push({ name: 'Recipient Name', value: item.recipient.name });
				item.options.push({ name: 'Recipient Email', value: item.recipient.email });
				item.options.push({ name: 'Sender Name', value: item.sender.name });
				item.options.push({ name: 'Sender Email', value: item.sender.email });
				item.options.push({ name: 'Message', value: item.message });
			}

			return item;
		});
	}

	async proceedToPayment() {
		this.checkout.sections.summary.active = false;
		this.checkout.sections.payment.active = true;
		this.cc.summaryForm.controls['isDone'].setValue(true);
		await this.checkout.timeout(100); // Allows the animation to go through
		this.cc.stepper.next();
	}
}
