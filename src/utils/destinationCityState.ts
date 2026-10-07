export interface DestinationCityStateInput {
  orderType: "delivery" | "pickup";
  formCity: string;
  formState: string;
  destinationPincode: string;
  locationCity?: string;
  locationState?: string;
  locationZipCode?: string;
}

export interface ResolvedDestinationCityState {
  destinationCity?: string;
  destinationState?: string;
}

export function resolveDestinationCityState(
  input: DestinationCityStateInput,
): ResolvedDestinationCityState {
  if (input.orderType !== "delivery") return {};

  const pincode = input.destinationPincode.trim();
  const locationZip = input.locationZipCode?.trim() ?? "";
  const locationMatchesPincode =
    pincode === "" || (locationZip !== "" && locationZip === pincode);

  const destinationCity =
    input.formCity.trim() ||
    (locationMatchesPincode ? input.locationCity?.trim() ?? "" : "");
  const destinationState =
    input.formState.trim() ||
    (locationMatchesPincode ? input.locationState?.trim() ?? "" : "");

  return {
    destinationCity: destinationCity || undefined,
    destinationState: destinationState || undefined,
  };
}
