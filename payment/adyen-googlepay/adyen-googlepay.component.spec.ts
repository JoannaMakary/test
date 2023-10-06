import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdyenGooglePayComponent } from './adyen-googlepay.component';

describe('AdyenGooglePayComponent', () => {
	let component: AdyenGooglePayComponent;
	let fixture: ComponentFixture<AdyenGooglePayComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [AdyenGooglePayComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(AdyenGooglePayComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
