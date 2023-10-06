import { Component, OnInit, NgZone, ViewChild } from '@angular/core';
import { Validators } from '@angular/forms';
import { DynamicFormService } from '@common/forms/dynamic-form.service';
import { CheckoutService } from '@service/checkout.service';
import { ConnectionService } from '@service/connection.service';
import { AppService } from '@service/app.service';
import { DialogService } from '@common/notification/dialog/dialog.service';

@Component({
	selector: 'checkout-cart',
	templateUrl: './cart.component.html',
	styleUrls: ['./cart.component.scss'],
})
export class CartComponent implements OnInit {
	coupon_form: any;
	coupon_inputs: any = [{ field: 'coupon' }];
	constructor(public checkout: CheckoutService, private df: DynamicFormService, private dialog: DialogService, private app: AppService, private connection: ConnectionService) {}

	ngOnInit(): void {
		this.coupon_form = this.df.createForm(this.coupon_inputs, {});
	}

	async applyCoupon() {
		try {
			this.app.loading = true;
			await this.checkout.service.applyCoupon(this.coupon_form.value.coupon);
			await this.checkout.refreshState();
			this.app.loading = false;
		} catch (e) {
			this.app.handleError(e);
		}
	}

	async removeCoupon(code) {
		try {
			this.app.loading = true;
			await this.checkout.service.removeCoupon(code);
			await this.checkout.refreshState();
			this.app.loading = false;
		} catch (e) {
			this.app.handleError(e);
		}
	}
}
