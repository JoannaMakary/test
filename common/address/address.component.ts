import { Component, OnInit, Input, Output, EventEmitter, NgZone, ViewChildren, ElementRef, Renderer2 } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { DynamicFormService } from '../../../../common/forms/dynamic-form.service';
import { CheckoutService } from '../../../../services/checkout.service';
import { RibonService } from '../../../../services/ribon.service';

declare const google: any;

@Component({
	selector: 'checkout-address',
	templateUrl: './address.component.html',
	styleUrls: ['./address.component.scss'],
})
export class AddressComponent implements OnInit {
	@Input() lineItemForm: any;
	@Input() address: any = {};
	@Input() type: string = 'shipping';
	@Output('form') formChange: EventEmitter<any> = new EventEmitter();
	@Output() addressUpdate: EventEmitter<any> = new EventEmitter<any>();
	@ViewChildren('addressInput', { read: ElementRef }) addressInputs: any;
	autocomplete_init: boolean = false;
	checked_customer: boolean = false;
	expandedAddress: boolean = false;
	filteredStates: any[] = [];
	selectedCountry: string = 'Canada';

	constructor(private df: DynamicFormService, public checkout: CheckoutService, private zone: NgZone, private ribon: RibonService, private renderer: Renderer2) {}

	async ngOnInit() {
		if (!this.checkout.countries.shipping || !this.checkout.countries.billing) {
			this.getCountries();
		}
	}

	async getCountries() {
		this.checkout.state = await this.checkout.service.loadShippingCountries();
		this.checkout.countries.shipping = this.checkout.state.data.getShippingCountries();
		this.checkout.countries.shipping = this.checkout.countries.shipping.filter((country) => {
			return country.code === 'CA' || country.code === 'US';
		});

		this.checkout.state = await this.checkout.service.loadBillingCountries();
		this.checkout.countries.billing = this.checkout.state.data.getBillingCountries();
		this.updateStates();
	}

	updateStates() {
		const shippingStates = this.checkout.countries.shipping.reduce((acc, country) => {
			if (country.subdivisions) {
				acc = [...acc, ...country.subdivisions.map((state) => ({ ...state, countryName: country.name, countryCode: country.code }))];
			}
			return acc;
		}, []);

		const billingStates = this.checkout.countries.billing.reduce((acc, country) => {
			if (country.subdivisions) {
				acc = [...acc, ...country.subdivisions.map((state) => ({ ...state, countryName: country.name, countryCode: country.code }))];
			}
			return acc;
		}, []);

		this.checkout.states = this.type === 'shipping' ? shippingStates : billingStates;
	}

	onStateInputChange(value: string) {
		this.updateStates();
		this.filteredStates = this._filterStates(value);
	}

	onCountryChange(country: string) {
		this.selectedCountry = country;
		this._filterStates('');
	}

	_filterStates(value: string): any[] {
		const filterValue = value.toLowerCase();
		return this.checkout.states
			.filter((state) => state.name.toLowerCase().includes(filterValue))
			.filter((state) => {
				if (this.selectedCountry) {
					return state.countryName === this.selectedCountry;
				} else {
					return true;
				}
			});
	}

	async updateAddress(address, type) {
		try {
			this.addressUpdate.emit(address);

			if (type === 'billing') {
				this.checkout.billingAddress.patchValue(address);
			}
		} catch (e) {
			console.log('e', e);
			this.checkout.loading = false;
		}
	}

	resetAddress(form) {
		form.reset();
		this.formChange.emit(form);
	}

	verifyAddress(address: string, formGroup) {
		const form = formGroup;
		const addressInput = this.addressInputs.find((input) => input.nativeElement === document.activeElement);

		if (addressInput) {
			// In case autocomplete doesnt play nicely
			addressInput.nativeElement?.closest('form')?.querySelector('.manual')?.click();
			addressInput.nativeElement?.click();
		}

		if (!this.autocomplete_init) {
			// making sure we dont keep reinitializing
			this.autocomplete_init = true;
			let autocomplete;
			if (this.type === 'shipping') {
				autocomplete = new google.maps.places.Autocomplete(addressInput?.nativeElement, {
					types: ['address'],
					componentRestrictions: { country: ['us', 'ca'] },
				});
			} else {
				autocomplete = new google.maps.places.Autocomplete(addressInput?.nativeElement, {
					types: ['address'],
				});
			}

			autocomplete.addListener('place_changed', async () => {
				const place = autocomplete.getPlace();
				const address = this.getFormattedAddress(place); // get the address components into what we can read (zip, province, etc)
				// setting each form control for them once they select their address
				this.toggleAddressForm(form, true);
				await this.checkout.timeout(100);
				form.controls.address1.setValue(address['address1']);
				form.controls.address2.setValue(address['address2']);
				form.controls.country.setValue(address['country']);
				form.controls.stateOrProvince.setValue(address['stateOrProvince']);
				form.controls.city.setValue(address['city']);
				form.controls.postalCode.setValue(address['postalCode']);
				// Sometimes it doesn't trigger the way we want so we force it open
				addressInput?.nativeElement?.closest('form')?.querySelector('.line:last-child .mat-form-field:nth-last-child(2) input')?.click();
				addressInput?.nativeElement?.closest('form')?.querySelector('.line:last-child .mat-form-field:last-child input')?.click();
			});
		}
		// helps with the positioning - for some reason the container option for autocomplete isn't working
		const pacContainer = document.getElementsByClassName('pac-container')[0];
		if (pacContainer) {
			const gmResults = addressInput?.nativeElement?.closest('.gm_results');
			gmResults?.append(pacContainer);
		}
	}

	getFormattedAddress(place) {
		const address = {};
		let streetNumber = '';
		let streetName = '';

		place.address_components.forEach((item) => {
			if (item['types'].indexOf('street_number') > -1) streetNumber = item['long_name'];
			else if (item['types'].indexOf('route') > -1) streetName = streetNumber.length > 0 ? ' ' + item['long_name'] : item['long_name'];
			else if (item['types'].indexOf('country') > -1) {
				address['countryCode'] = item['short_name'];
				address['country'] = item['long_name'];
			} else if (item['types'].indexOf('sublocality_level_1') > -1) {
				let locality = place.address_components.find((e) => {
					return e.types.includes('locality');
				});
				if (locality) {
					// Already has a city so this will be address 2
					// address["address2"] = item["long_name"];
					address['city'] = locality['long_name'];
				} else {
					// Otherwise doesn't have a city and needs to use sublocalit_level_1 as the city
					address['city'] = item['long_name'];
				}
			} else if (item['types'].indexOf('locality') > -1) address['city'] = item['long_name'];
			else if (item['types'].indexOf('administrative_area_level_2') > -1) {
				let locality = place.address_components.find((e) => {
					return e.types.includes('locality');
				});

				if (!locality) {
					address['city'] = item['long_name'];
				}
			} else if (item['types'].indexOf('postal_code') > -1) address['postalCode'] = item['long_name'];
			else if (item['types'].indexOf('administrative_area_level_1') > -1) {
				address['stateOrProvinceCode'] = item['short_name'];
				address['stateOrProvince'] = item['long_name'];
			}
			if (item['types'].indexOf('subpremise') > -1 || item['types'].indexOf('floor') > -1 || item['types'].indexOf('room') > -1 || item['types'].indexOf('establishment') > -1) {
				address['address2'] = item['long_name'];
			}
		});

		address['address1'] = streetNumber + streetName;
		return address;
	}

	toggleEdit(address, form) {
		// Reset all to be closed
		this.checkout.customerAddresses = this.checkout.customerAddresses.map((a) => {
			a.expanded = false;
			return a;
		});

		address.expanded = !address.expanded;
		this.expandedAddress = address.expanded;

		if (address.expanded) {
			// Assign the values of the expanded address to existingAddressForm
			form.patchValue({
				id: address.id,
				expanded: true,
				firstName: address.firstName,
				lastName: address.lastName,
				company: address.company,
				phone: address.phone,
				address1: address.address1,
				address2: address.address2,
				country: address.country,
				stateOrProvince: address.stateOrProvince,
				city: address.city,
				postalCode: address.postalCode,
			});
		}
	}

	shouldShowCustomerAddresses(): boolean {
		return this.checkout.hasAddressBook() && (this.checkout.isDelivery() || (!this.checkout.isDelivery() && this.type == 'billing'));
	}

	getAddressType(): string {
		return this.checkout.sections.shipping?.active ? 'shipping' : 'billing';
	}

	isExpandedAddress(): boolean {
		return this.expandedAddress || this.checkout.newAddress || (this.lineItemForm ? this.lineItemForm?.showNewAddressForm : this.checkout.globalItemForm?.showNewAddressForm);
	}

	toggleAddressForm(formGroup, expand): void {
		if (formGroup) {
			formGroup.showNewAddressForm = expand;
		}
	}

	isExpandedForm(formGroup): boolean {
		return formGroup.showNewAddressForm;
	}

	shouldShowEditAddressForm(address: any, formGroup): boolean {
		return !this.checkout.newAddress && this.isAddressExpanded(address) && formGroup.value.id == address.id;
	}

	isAddressExpanded(address: any): boolean {
		return address.expanded;
	}

	resetForm(form: FormGroup) {
		form.reset();
		form.markAsPristine();
		form.markAsUntouched();
	}
}
