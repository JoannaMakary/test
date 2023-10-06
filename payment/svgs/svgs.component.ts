import { Component, OnInit, Input } from '@angular/core';

@Component({
	selector: 'payment-svgs',
	templateUrl: './svgs.component.html',
	styleUrls: ['./svgs.component.scss'],
})
export class SvgsComponent implements OnInit {
	@Input() card: any = false;
	@Input() active: any = false;
	constructor() {}

	ngOnInit(): void {}
}
