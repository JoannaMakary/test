import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PaymentLoaderComponent } from './payment-loader.component';

describe('PaymentLoaderComponent', () => {
	let component: PaymentLoaderComponent;
	let fixture: ComponentFixture<PaymentLoaderComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [PaymentLoaderComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(PaymentLoaderComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
