import { Component, OnInit, ViewChild, Input, Output, EventEmitter } from '@angular/core';
import { CheckoutService } from '@app/services/checkout.service';
import { RibonService } from '@app/services/ribon.service';
import { CheckoutComponent } from '../checkout.component';
import { Subscription, map } from 'rxjs';
import { CartService } from '@app/services/cart.service';
import { CalendarService } from '@app/services/calendar.service';
import { DynamicFormService } from '@common/forms/dynamic-form.service';
import { DialogService } from '@common/notification/dialog/dialog.service';
import { LocalStorageService } from '@app/services/local-storage.service';
declare var window: any;

@Component({
	selector: 'checkout-shipping',
	templateUrl: './shipping.component.html',
	styleUrls: ['./shipping.component.scss'],
})
export class ShippingComponent implements OnInit {
	stores: any = [];
	selectedStore: any;
	subscription: Subscription;
	cardMessagesTemplate: any;
	options: any = [];
	checkedCards: boolean = false;

	@ViewChild('checkoutAddress', { static: false }) checkoutAddress: any;
	@Output() formChange: EventEmitter<any> = new EventEmitter<any>();

	constructor(
		private df: DynamicFormService,
		public checkout: CheckoutService,
		private ribon: RibonService,
		public cc: CheckoutComponent,
		private cart: CartService,
		public calendar: CalendarService,
		private dialog: DialogService,
		private ls: LocalStorageService
	) {}

	ngOnInit(): void {
		this.checkout.scrollToTop();

		if (!this.checkout.misc.value.shipping_type) {
			this.checkout.misc.controls.shipping_type.setValue('1'); // default to delivery
		}
		this.getStores();
	}

	ngAfterViewChecked() {
		// Stops reading the value for some reason
		if (this.checkout.isDelivery() && this.checkout.hasAddressBook() && !this.checkout.forms.lineItems[0].value.address1 && !this.checkout.newAddress) {
			this.checkout.forms.lineItems[0].patchValue(this.checkout.customerAddresses[0]);
			this.checkout.globalItemForm.patchValue(this.checkout.customerAddresses[0]);
			this.isValidAddresses();
		}

		if (
			!this.checkout.isDelivery()
			// && !this.checkout.misc.value.pickup_store
		) {
			this.checkout.misc.controls.pickup_store.setValue(this.stores[0]); // default to first store
			this.cc.formComponents.find((e) => e.label.toLowerCase().includes('date')).label = 'Pickup Date'; // Show in the step header
		} else if (this.checkout.isDelivery()) {
			this.cc.formComponents.find((e) => e.label.toLowerCase().includes('date')).label = 'Delivery Date'; // Show in the step header
		}

		if (window.moveToStep && (window.moveToStep == 'summary' || window.moveToStep == 'delivery')) {
			let stored_consignments = this.ls.get('consignmentsDatesOptions');
			stored_consignments ? (stored_consignments = JSON.parse(stored_consignments)) : (stored_consignments = []);
			window.moveToStep = null;
			// this.proceedToDelivery(); // TODO
		}
	}

	async getStores() {
		this.stores = await this.ribon.dataGet(`/pickup_location_addresses?active=1`, {});
		this.stores = this.stores.map(({ address1, address2, city, company, countryCode, firstName, lastName, phone, postalCode, stateOrProvince, stateOrProvinceCode }) => ({
			address1,
			address2,
			city,
			company,
			countryCode,
			firstName,
			lastName,
			phone,
			postalCode,
			stateOrProvince,
			stateOrProvinceCode,
		}));
	}

	async resetShipping() {
		this.checkout.loading = true;

		if (this.checkout.isDelivery()) {
			this.cc.formComponents.find((e) => e.label.toLowerCase().includes('date')).label = 'Delivery Date'; // Show in the step header
			if (this.checkout.hasAddressBook() && !this.checkout.forms.lineItems[0].value.address1) {
				this.checkout.forms.lineItems[0].patchValue(this.checkout.customerAddresses[0]);
				this.checkout.globalItemForm.patchValue(this.checkout.customerAddresses[0]);
			}
		}

		if (!this.checkout.isDelivery()) {
			this.checkout.misc.controls.pickup_store.setValue(this.stores[0]); // default to first store
			this.cc.formComponents.find((e) => e.label.toLowerCase().includes('date')).label = 'Pickup Date'; // Show in the step header
		} else {
			this.cc.formComponents.find((e) => e.label.toLowerCase().includes('date')).label = 'Delivery Date'; // Show in the step header
		}

		this.updateItems();
		this.checkout.loading = false;
	}

	async setConsignments() {
		// Delete existing consignments
		const consignment_ids = this.checkout.checkout.consignments.map((consignment) => consignment.id);
		for (const consignment_id of consignment_ids) {
			console.log(consignment_id);
			await this.checkout.service.deleteConsignment(consignment_id);
		}

		await this.checkout.refreshState();

		if (!this.checkout.isDelivery()) {
			await this.createPickupConsignment();
		} else if (this.checkout.isDelivery()) {
			if (this.checkout.hasBuildProducts) {
				await this.createDeliveryBuildConsignments();
			} else {
				await this.createDeliveryConsignments();
			}
		}

		await this.checkout.refreshState(undefined, {
			include: `consignments.availableShippingOptions,cart.lineItems.physicalItems.options,cart.lineItems.digitalItems.options,customer,promotions.banners`,
		});
		await this.isValidConsignments();
	}

	async createPickupConsignment() {
		try {
			// Pick Up Consignments
			// We can create one consignment (one store/address) for all the products
			this.checkout.state = await this.checkout.service.loadCheckout(undefined, {
				include: `consignments.availableShippingOptions,cart.lineItems.physicalItems.options,cart.lineItems.digitalItems.options,customer,promotions.banners`,
			});

			const lineItems = this.checkout.checkout.cart.lineItems.physicalItems.map((item) => {
				return {
					itemId: item.id,
					quantity: item.quantity,
				};
			});

			const customer_exists = await this.checkout.getCustomerByEmail(this.checkout.checkout.cart.email);
			if (customer_exists.length) {
				this.checkout.misc.value.pickup_store.firstName = customer_exists[0].first_name;
				this.checkout.misc.value.pickup_store.lastName = customer_exists[0].last_name;
			}

			const pickup_consignment = [
				{
					address: this.checkout.misc.value.pickup_store,
					lineItems,
					shippingAddress: this.checkout.misc.value.pickup_store,
				},
			];

			this.checkout.state = await this.checkout.service.createConsignments(pickup_consignment);
			const created_consignments = this.checkout.state.data.getConsignments();

			this.checkout.state = await this.checkout.service.loadShippingOptions();
			this.options = this.checkout.state.data.getShippingOptions();
			console.log('options', this.options, this.checkout.checkout);

			const pickup_option = this.options.find((option) => option.description.toLowerCase().includes('pickup'));

			if (pickup_option) {
				this.checkout.state = this.checkout.service.selectShippingOption(pickup_option.id);
				await this.checkout.refreshState(undefined, {
					include: `consignments.availableShippingOptions,cart.lineItems.physicalItems.options,cart.lineItems.digitalItems.options,customer,promotions.banners`,
				});
				pickup_consignment[0]['option'] = pickup_option;
			}

			this.checkout.shipping_options = created_consignments;
		} catch (e) {
			console.log(e);
			this.checkout.loading = false;
			// Show error
			this.dialog.showDialogError(
				'Something went wrong!',
				"An error occurred while processing your shipping address(es), please check your address details and try again.<br><br>Please feel free to contact us if you are experiencing issues <a href='mailto:help@baskits.com'>help@baskits.com</a> / <a href='tel:18005619177'>1-800-561-9177</a>."
			);
			this.checkout.shippingLoading = false;
			document.body.classList.remove('disable-scroll');
		}
	}

	async createDeliveryConsignments() {
		try {
			// We can create one consignment (one store/address) for all the products
			this.checkout.state = await this.checkout.service.loadCheckout(undefined, {
				include: `consignments.availableShippingOptions,cart.lineItems.physicalItems.options,cart.lineItems.digitalItems.options,customer,promotions.banners`,
			});

			let consignments = [];

			if (this.checkout.isMultiAddress) {
				// Lets make sure to combine items that go to the same address
				const grouped = {};

				const addressVariations = {
					road: ['rd'],
					street: ['st'],
					avenue: ['ave'],
					boulevard: ['blvd'],
					drive: ['dr'],
					lane: ['ln'],
					circle: ['cir'],
					court: ['ct'],
					place: ['pl'],
					terrace: ['ter'],
					highway: ['hwy'],
					square: ['sq'],
					parkway: ['pkwy'],
					crescent: ['cres'],
					expressway: ['expwy'],
					alley: ['aly'],
					route: ['rte'],
					way: ['wy'],
					plaza: ['plz'],
					garden: ['gdn'],
					loop: ['lp'],
					path: ['pth'],
					row: ['row'],
					station: ['sta'],
					track: ['trk'],
					tunnel: ['tun'],
					crossing: ['xing'],
					bridge: ['brg'],
					esplanade: ['espl'],
					park: ['pk'],
					trail: ['trl'],
					viaduct: ['vdct'],
					cove: ['cv'],
					knoll: ['knl'],
					bend: ['bnd'],
					overpass: ['opas'],
					underpass: ['upas'],
					bypass: ['byp'],
					ranch: ['rnch'],
					crossroad: ['xrd'],
					bayou: ['byu'],
					beach: ['bch'],
					common: ['cmn'],
					corner: ['cor'],
					haven: ['hvn'],
					harbor: ['hbr'],
					hollow: ['holw'],
					isle: ['isle'],
					junction: ['jct'],
					key: ['key'],
					landing: ['lndg'],
					orchard: ['orch'],
					oval: ['oval'],
					passage: ['pass'],
					pike: ['pike'],
					port: ['prt'],
					springs: ['spgs'],
					turnpike: ['tpke'],
					village: ['vlg'],
				};

				const variationRegex = new RegExp(`\\b(?:${Object.keys(addressVariations).concat(Object.values(addressVariations).flat()).join('|')})\\b`, 'gi');

				for (const item of this.checkout.forms.lineItems) {
					const addressString = [
						item.value.address1,
						// item.value.address2,
						item.value.city,
						item.value.postalCode,
					]
						.map((value) => (value ? value.toLowerCase().replace(variationRegex, '').replace(/\s+/g, '') : ''))
						.join('|');

					if (!grouped[addressString]) {
						grouped[addressString] = { ...item, details: [item.details] };
					} else {
						grouped[addressString].details.push(item.details);
					}
				}

				console.log('GROUPED', grouped);
				const groupedLineItems: any[] = Object.values(grouped);

				for (const lineItem of groupedLineItems) {
					const lineItems = [];

					for (const item of lineItem.details) {
						lineItems.push({
							itemId: item.id,
							quantity: item.quantity,
						});
					}

					// We will map country and province codes here
					if (!lineItem.value.countryCode) {
						lineItem.value.countryCode = this.checkout.countries.shipping.find((country) => country.name === lineItem.value.country)?.code;
					}
					if (lineItem.value.stateOrProvince.length == 2) {
						// User probably put the province code, need to map back to full
						lineItem.value.stateOrProvince = this.checkout.countries?.shipping
							?.find((country) => country.name === lineItem.value.country)
							?.subdivisions?.find((province) => province.code === lineItem.value.stateOrProvince)?.name;
					}
					if (!lineItem.value.stateOrProvinceCode) {
						lineItem.value.stateOrProvinceCode = this.checkout.countries.shipping
							.find((country) => country.name === lineItem.value.country)
							.subdivisions.find((province) => province.name === lineItem.value.stateOrProvince.replaceAll('é', 'e'))?.code;
					}

					consignments.push({
						address: lineItem.value,
						lineItems,
						shippingAddress: lineItem.value,
					});
				}
			} else {
				const lineItems = this.checkout.checkout.cart.lineItems.physicalItems.map((item) => {
					return {
						itemId: item.id,
						quantity: item.quantity,
					};
				});

				// We will map country and province codes here
				if (!this.checkout.globalItemForm.value.countryCode) {
					this.checkout.globalItemForm.value.countryCode = this.checkout.countries?.shipping?.find((country) => country.name === this.checkout.globalItemForm.value.country)?.code;
				}
				if (this.checkout.globalItemForm.value.stateOrProvince.length == 2) {
					// User probably put the province code, need to map back to full
					this.checkout.globalItemForm.value.stateOrProvince = this.checkout.countries?.shipping
						?.find((country) => country.name === this.checkout.globalItemForm.value.country)
						?.subdivisions?.find((province) => province.code === this.checkout.globalItemForm.value.stateOrProvince)?.name;
				}
				if (!this.checkout.globalItemForm.value.stateOrProvinceCode) {
					this.checkout.globalItemForm.value.stateOrProvinceCode = this.checkout.countries.shipping
						.find((country) => country.name === this.checkout.globalItemForm.value.country)
						.subdivisions.find((province) => province.name === this.checkout.globalItemForm.value.stateOrProvince.replaceAll('é', 'e'))?.code;
				}

				consignments.push({
					address: this.checkout.globalItemForm.value,
					lineItems,
					shippingAddress: this.checkout.globalItemForm.value,
				});
			}

			console.log('consignments', consignments);

			this.checkout.state = await this.checkout.service.createConsignments(consignments);
			const created_consignments = this.checkout.state.data.getConsignments();

			this.checkout.state = await this.checkout.service.loadShippingOptions();
			this.options = this.checkout.state.data.getShippingOptions();
			console.log('options', this.options, this.checkout.checkout);

			this.checkout.shipping_options = created_consignments;
		} catch (e) {
			console.log(e);
			this.checkout.loading = false;
			// Show error
			this.dialog.showDialogError(
				'Something went wrong!',
				"An error occurred while processing your shipping address(es), please check your address details and try again.<br><br>Please feel free to contact us if you are experiencing issues <a href='mailto:help@baskits.com'>help@baskits.com</a> / <a href='tel:18005619177'>1-800-561-9177</a>."
			);
			this.checkout.shippingLoading = false;
			document.body.classList.remove('disable-scroll');
		}
	}

	async createDeliveryBuildConsignments() {
		try {
			// We can create one consignment (one store/address) for all the products
			this.checkout.state = await this.checkout.service.loadCheckout(undefined, {
				include: `consignments.availableShippingOptions,cart.lineItems.physicalItems.options,cart.lineItems.digitalItems.options,customer,promotions.banners`,
			});

			let consignments = [];

			const groupedBuildForms = this.checkout.forms.lineItems
				.reduce(
					(result, item) => {
						const { buildIndex } = item;
						if (buildIndex === undefined) {
							result[0].push(item); // Group forms without buildIndex into index 0
						} else {
							if (!result[buildIndex]) {
								result[buildIndex] = [];
							}
							result[buildIndex].push(item);
						}
						return result;
					},
					[[]]
				)
				.filter((forms) => forms.length > 0);

			for (const lineItem of groupedBuildForms) {
				const lineItems = [];

				if (lineItem[0].buildProducts?.items?.length) {
					for (const item of lineItem[0].buildProducts.items) {
						lineItems.push({
							itemId: item.id,
							quantity: item.quantity,
						});
					}
				} else {
					lineItems.push({
						itemId: lineItem.details?.id,
						quantity: lineItem.details?.quantity,
					});
				}

				// We will map country and province codes here
				if (!lineItem[0].value.countryCode) {
					lineItem[0].value.countryCode = this.checkout.countries.shipping.find((country) => country.name === lineItem[0].value.country)?.code;
				}
				if (lineItem[0].value.stateOrProvince.length == 2) {
					// User probably put the province code, need to map back to full
					lineItem[0].value.stateOrProvince = this.checkout.countries?.shipping
						?.find((country) => country.name === lineItem[0].value.country)
						?.subdivisions?.find((province) => province.code === lineItem[0].value.stateOrProvince)?.name;
				}
				if (!lineItem[0].value.stateOrProvinceCode) {
					lineItem[0].value.stateOrProvinceCode = this.checkout.countries.shipping
						.find((country) => country.name === lineItem[0].value.country)
						.subdivisions.find((province) => province.name === lineItem[0].value.stateOrProvince.replaceAll('é', 'e'))?.code;
				}

				consignments.push({
					address: lineItem[0].value,
					lineItems,
					shippingAddress: lineItem[0].value,
				});
			}

			console.log('consignments', consignments);

			this.checkout.state = await this.checkout.service.createConsignments(consignments);
			const created_consignments = this.checkout.state.data.getConsignments();

			this.checkout.state = await this.checkout.service.loadShippingOptions();
			this.options = this.checkout.state.data.getShippingOptions();
			console.log('options', this.options, this.checkout.checkout);

			this.checkout.shipping_options = created_consignments;
		} catch (e) {
			console.log(e);
			this.checkout.loading = false;
			// Show error
			this.dialog.showDialogError(
				'Something went wrong!',
				"An error occurred while processing your shipping address(es), please check your address details and try again.<br><br>Please feel free to contact us if you are experiencing issues <a href='mailto:help@baskits.com'>help@baskits.com</a> / <a href='tel:18005619177'>1-800-561-9177</a>."
			);
			this.checkout.shippingLoading = false;
			document.body.classList.remove('disable-scroll');
		}
	}

	async proceedToDelivery() {
		if (!this.checkout.cardMessagesForm.valid && !this.checkedCards) {
			this.checkedCards = true;

			return this.dialog.showDialogError('Missing required fields!', "Please enter the recipient's and sender's names.");
		}

		if ((!this.checkout.refreshingCheckout && !this.checkout.loading && !this.checkout.isDelivery()) || (this.checkout.isDelivery() && this.isValidAddresses())) {
			this.checkout.shippingLoading = true;
			this.checkout.scrollToTop();
			document.body.classList.add('disable-scroll');

			this.cc.addressForm?.controls['isDone'].setValue(false);
			this.checkout.loading = true;
			this.updateItems();
			await this.setConsignments();

			document.body.classList.remove('disable-scroll');
			this.checkout.shippingLoading = false;
		}
	}

	async isValidConsignments() {
		this.checkout.state = await this.checkout.service.loadCheckout(undefined, {
			include: `consignments.availableShippingOptions,cart.lineItems.physicalItems.options,cart.lineItems.digitalItems.options,customer,promotions.banners`,
		});

		let valid;
		// The simplest check, if there are no associations it is not valid
		if (!this.checkout.hasConsignments() && this.checkout.checkout.cart.lineItems.physicalItems.length) {
			valid = false;
		} else if (this.checkout.hasConsignments() == 1 && !this.checkout.isDelivery() && this.checkout.checkout.consignments[0].address.address1 == this.checkout.misc.value.pickup_store.address1) {
			valid = true;
		} else if (this.checkout.hasConsignments() && this.checkout.isDelivery()) {
			if (this.options.length) {
				// if (this.checkout?.checkout?.consignments?.every((consignment) => consignment.availableShippingOptions?.length)) {
				valid = true;
			} else {
				valid = false;
			}
		}

		// console.log('isValidConsignments', this.checkout.checkout, this.checkout.hasConsignments(), this.checkout.checkout.cart.lineItems.physicalItems.length, valid);

		if (valid) {
			this.checkout.sections.shipping.active = false;
			this.checkout.sections.delivery.active = true;
			this.cc.addressForm?.controls['isDone'].setValue(true);
			await this.checkout.timeout(100); // Allows the animation to go through
			this.cc.stepper.next();
		} else {
			this.cc.addressForm?.controls['isDone'].setValue(false);
			this.dialog.showDialogError(
				'Something went wrong!',
				"Your shipping address(es) may be invalid, please check your address details and try again.<br><br>Please feel free to contact us if you are experiencing issues <a href='mailto:help@baskits.com'>help@baskits.com</a> / <a href='tel:18005619177'>1-800-561-9177</a>."
			);
			this.checkout.loading = false;
			this.checkout.shippingLoading = false;
			document.body.classList.remove('disable-scroll');
		}
		this.checkout.loading = false;
		this.checkout.shippingLoading = false;
		document.body.classList.remove('disable-scroll');
	}

	toggleMultiAddress() {
		this.checkout.isMultiAddress = !this.checkout.isMultiAddress;
	}

	handleAddressUpdate(event, index) {
		// We will update the form values here for selected addresses
		if (this.checkout.hasAddressBook()) {
			const { id, address1, address2, city, company, country, countryCode, firstName, lastName, phone, postalCode, stateOrProvince, stateOrProvinceCode } = event;

			// Update the form values for the line item at the specified index
			const lineItemForm = this.checkout.forms.lineItems[index];
			lineItemForm.patchValue({ id, address1, address2, city, company, country, countryCode, firstName, lastName, phone, postalCode, stateOrProvince, stateOrProvinceCode });

			if (index === 0) {
				// Update the form values for the global item form
				this.checkout.globalItemForm.patchValue({ id, address1, address2, city, company, country, countryCode, firstName, lastName, phone, postalCode, stateOrProvince, stateOrProvinceCode });
			}
		}
	}

	isValidAddresses(): boolean {
		if (this.checkout.hasAlcoholRestrictions) {
			const restrictions = this.checkAlcoholRestrictions();
			if (restrictions) {
				return false;
			}
		}

		// For build products we only care about the global form
		if (this.checkout.hasBuildProducts) {
			const groupedBuildForms = this.checkout.forms.lineItems
				.reduce(
					(result, item) => {
						const { buildIndex } = item;
						if (buildIndex === undefined) {
							result[0].push(item); // Group forms without buildIndex into index 0
						} else {
							if (!result[buildIndex]) {
								result[buildIndex] = [];
							}
							result[buildIndex].push(item);
						}
						return result;
					},
					[[]]
				)
				.filter((forms) => forms.length > 0);

			return groupedBuildForms.every((forms) => forms.length > 0 && forms[0].valid);
		}

		if (this.checkout.isMultiAddress) {
			const invalidLineItems = this.checkout.forms.lineItems.filter((lineItem) => {
				const isRequiredFieldsFilled =
					lineItem?.value?.firstName &&
					lineItem?.value?.lastName &&
					lineItem?.value?.phone &&
					lineItem?.value?.address1 &&
					lineItem?.value?.country &&
					lineItem?.value?.stateOrProvince &&
					lineItem?.value?.city &&
					lineItem?.value?.postalCode;

				const isValidStateOrProvince = this.checkout.states.some((state) => {
					return state.name.toLowerCase() === lineItem?.value?.stateOrProvince.toLowerCase() && state.countryName.toLowerCase() === lineItem?.value?.country.toLowerCase();
				});

				if (!isValidStateOrProvince) {
					lineItem.get('stateOrProvince').setErrors({ invalidState: true });
					return true;
				}

				if (!lineItem?.valid && isRequiredFieldsFilled) {
					lineItem.markAllAsTouched();
				}

				return !lineItem.valid;
			});

			if (!invalidLineItems.length) {
				return true;
			} else {
				return false;
			}
		} else {
			const isRequiredFieldsFilled =
				this.checkout.globalItemForm?.value?.firstName &&
				this.checkout.globalItemForm?.value?.lastName &&
				this.checkout.globalItemForm?.value?.phone &&
				this.checkout.globalItemForm?.value?.address1 &&
				this.checkout.globalItemForm?.value?.country &&
				this.checkout.globalItemForm?.value?.stateOrProvince &&
				this.checkout.globalItemForm?.value?.city &&
				this.checkout.globalItemForm?.value?.postalCode;

			const isValidStateOrProvince = this.checkout.states.some((state) => {
				return (
					state.name.toLowerCase() === this.checkout.globalItemForm?.value?.stateOrProvince.toLowerCase() &&
					state.countryName.toLowerCase() === this.checkout.globalItemForm?.value?.country.toLowerCase()
				);
			});

			if (!this.checkout.globalItemForm?.valid && isRequiredFieldsFilled) {
				this.checkout.globalItemForm?.markAllAsTouched();
			}

			if (!isValidStateOrProvince) {
				this.checkout.globalItemForm?.get('stateOrProvince').setErrors({ invalidState: true });
				return false;
			}

			return this.checkout.globalItemForm?.valid;
		}
	}

	checkAlcoholRestrictions() {
		let restriction = false;
		// We need to check if the user has alcohol in their cart
		// If they do, we cannot ship outside Ontario
		this.checkout.forms.lineItems.forEach((item) => {
			item.alcoholNotice = false;
			const matchingProduct = this.checkout.products?.find((product) => product.id === item.details.productId);
			if (matchingProduct && matchingProduct.modifiers?.find((modifier) => modifier.display_name.toLowerCase().includes('alcohol restriction'))) {
				if (item.value?.stateOrProvince && item.value?.stateOrProvince.toLowerCase() !== 'ontario') {
					item.alcoholNotice = true;
					restriction = true;
					this.checkout.globalItemForm = this.checkout.forms.lineItems[0];
				}
			}
		});

		if (restriction) {
			return true;
		} else {
			return false;
		}
	}

	async updateItems() {
		const items = this.checkout.items;
		const formValues = this.checkout.cardMessagesForm.value;
		const regex = /^(.*?)(\d+)$/;
		const groupedValues = {};

		// Group the values by index
		Object.keys(formValues).forEach((key) => {
			const matches = regex.exec(key);
			if (matches) {
				const fieldName = matches[1] === 'message' ? 'note' : matches[1];
				const index = matches[2];
				const value = formValues[key];

				groupedValues[index] = groupedValues[index] || [];
				groupedValues[index].push({ fieldName, value });
			}
		});

		// Update items based on grouped values
		for (const index of Object.keys(groupedValues)) {
			const itemToUpdate = items[index];
			const fieldsToUpdate = groupedValues[index];
			let options = [];
			let filterNeeded = false;

			for (const { fieldName, value } of fieldsToUpdate) {
				const existingValue = itemToUpdate.options?.find((option) => option.name.toLowerCase() === fieldName);

				if (!existingValue && value !== '') {
					filterNeeded = true;
					// Add modifiers to product options
					const matchingProduct = this.checkout.products.find((product) => product.id === itemToUpdate.productId);
					if (matchingProduct && matchingProduct.modifiers) {
						const modifiers = matchingProduct.modifiers.filter(
							(modifier) => modifier.name.toLowerCase() === 'to' || modifier.name.toLowerCase() === 'from' || modifier.name.toLowerCase() === 'note'
						);

						for (const modifier of modifiers) {
							const option_id = modifier.id;
							let option_value = '';

							if (modifier.name.toLowerCase() === fieldName) {
								option_value = value;
							}

							const optionSelection = {
								option_id: option_id,
								option_value: option_value,
							};

							options.push(optionSelection);
						}
					}
				}

				if (existingValue) {
					filterNeeded = false;
					// Update existing options
					options.push({
						option_id: existingValue.nameId,
						option_value: value,
					});
				}
			}

			// Need to store previous feelds too (ex. Personalization Field or Alcohol restriction)
			if (itemToUpdate.options.length) {
				for (const option of itemToUpdate.options) {
					if (option.value !== 'None' && option.value) {
						filterNeeded = true;
						if (option.name.toLowerCase().includes('alcohol')) {
							options.push({
								option_id: option.nameId,
								option_value: option.valueId,
							});
						} else {
							options.push({
								option_id: option.nameId,
								option_value: option.value,
							});
						}
					}
				}
			}

			options = options.filter((option) => option.value !== 'None');

			if (options.length) {
				let optionSelections = [];
				const seenOptionIds = new Set();

				if (filterNeeded) {
					// Here we remove duplicate optionSelections, favoring the values that exist
					for (const item of options) {
						const { option_id, option_value } = item;

						if (!seenOptionIds.has(option_id)) {
							optionSelections.push(item);
							seenOptionIds.add(option_id);
						} else if (option_value && !optionSelections.find((el) => el.option_id === option_id).option_value) {
							const existingIndex = optionSelections.findIndex((el) => el.option_id === option_id);
							optionSelections[existingIndex] = item;
						}
					}
				} else {
					optionSelections = options;
				}

				const query = {
					lineItem: {
						productId: itemToUpdate.productId,
						variantId: itemToUpdate.variantId,
						quantity: itemToUpdate.quantity,
						optionSelections,
					},
				};

				console.log('jotestttttttttttttttttttt', query);
				if (!itemToUpdate.buildProduct) {
					await this.cart.updateCartLineItem(this.checkout.checkout.id, itemToUpdate.id, query);
				} else if (itemToUpdate.name?.toLowerCase().includes(' box')) {
					await this.cart.updateCartLineItem(this.checkout.checkout.id, itemToUpdate.id, query);
				}

				if (parseInt(index) === Object.keys(groupedValues).length - 1) {
					await this.checkout.refreshState();
				}
			}
		}
	}

	onMessageKeyup(event: any, index: number) {
		const controlName = `message${index}`;
		const messageControl = this.checkout.cardMessagesForm.get(controlName);

		const inputField = event.target as HTMLInputElement;
		const regex = /[^a-z0-9.,?!\-':@#$%()*&_+^=éàèùâêîôûëïüç|~/"`\\ ]/gi;
		const sanitizedValue = inputField.value.replace(regex, '');
		messageControl.setValue(sanitizedValue);

		// Update the character count dynamically
		messageControl.markAsDirty(); // Ensure FormControl is marked as dirty
	}

	// Calculate character count based on the index
	getMessageCharacterCount(index: number): number {
		const controlName = `message${index}`;
		const messageControl = this.checkout.cardMessagesForm.get(controlName);

		const value = messageControl.value ? messageControl.value : '';
		return value.length;
	}

	getErroredFields() {
		let displayMessage = 'Please enter a valid delivery address.';
		const fieldsOrder = ['firstName', 'lastName', 'phone', 'address1', 'country', 'stateOrProvince', 'city', 'postalCode'];
		const fieldLabels = {
			address1: 'street address',
			phone: 'phone number',
			stateOrProvince: 'province/state',
			postalCode: 'postal code/zip',
		};

		if (this.checkout.forms.lineItems.length > 1 && this.checkout.isMultiAddress) {
			this.checkout.forms.lineItems?.forEach((form) => {
				if (form?.invalid) {
					for (let i = 0; i < fieldsOrder.length; i++) {
						const field = fieldsOrder[i];
						const control = form.get(field);

						if (control?.invalid) {
							const fieldLabel =
								fieldLabels[field] ||
								field
									.replace(/([A-Z])/g, ' $1')
									.trim()
									.toLowerCase();
							// Change the display message to specify the invalid field
							displayMessage = `Please enter a ${fieldLabel} in your delivery address (for ${form?.details?.name}).`;
							break;
						}
					}
				}
			});
		} else {
			const form = this.checkout.globalItemForm;
			if (form?.invalid) {
				for (let i = 0; i < fieldsOrder.length; i++) {
					const field = fieldsOrder[i];
					const control = form.get(field);

					if (control?.invalid) {
						const fieldLabel =
							fieldLabels[field] ||
							field
								.replace(/([A-Z])/g, ' $1')
								.trim()
								.toLowerCase();
						// Change the display message to specify the invalid field
						displayMessage = `Please enter a ${fieldLabel} in your delivery address.`;
						break;
					}
				}
			}
		}

		return displayMessage;
	}
}
