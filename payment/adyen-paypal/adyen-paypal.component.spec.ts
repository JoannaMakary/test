import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdyenPayPalComponent } from './adyen-paypal.component';

describe('AdyenPayPalComponent', () => {
	let component: AdyenPayPalComponent;
	let fixture: ComponentFixture<AdyenPayPalComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [AdyenPayPalComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(AdyenPayPalComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
