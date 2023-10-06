import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShippingLoaderComponent } from './shipping-loader.component';

describe('ShippingLoaderComponent', () => {
	let component: ShippingLoaderComponent;
	let fixture: ComponentFixture<ShippingLoaderComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [ShippingLoaderComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(ShippingLoaderComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
