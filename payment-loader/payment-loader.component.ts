import { Component, OnInit } from '@angular/core';
import { CheckoutService } from '@service/checkout.service';

@Component({
	selector: 'payment-loader',
	templateUrl: './payment-loader.component.html',
	styleUrls: ['./payment-loader.component.scss'],
})
export class PaymentLoaderComponent implements OnInit {
	constructor(public checkout: CheckoutService) {}

	ngOnInit(): void {}
}
