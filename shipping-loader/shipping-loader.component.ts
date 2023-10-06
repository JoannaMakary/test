import { Component, OnInit } from '@angular/core';
import { CheckoutService } from '@app/services/checkout.service';

@Component({
	selector: 'shipping-loader',
	templateUrl: './shipping-loader.component.html',
	styleUrls: ['./shipping-loader.component.scss'],
})
export class ShippingLoaderComponent implements OnInit {
	constructor(public checkout: CheckoutService) {}

	ngOnInit(): void {}
}
