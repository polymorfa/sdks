package polymorfa

import "context"

type WhatsAppAccountType string

const (
	WhatsAppApp     WhatsAppAccountType = "whatsapp_app"
	BusinessApp     WhatsAppAccountType = "business_app"
	MetaCloud       WhatsAppAccountType = "meta_cloud"
	MetaCoexistence WhatsAppAccountType = "meta_coexistence"
)

type TestingPrimaryPlatform string

const (
	TestingAndroid TestingPrimaryPlatform = "android"
	TestingIOS     TestingPrimaryPlatform = "ios"
)

type ContactEncryption string

const (
	ContactEndToEnd    ContactEncryption = "end_to_end"
	ContactHybrid      ContactEncryption = "hybrid"
	ContactNotEndToEnd ContactEncryption = "not_end_to_end"
)

type TestingAccountModeRequest struct {
	AccountType     WhatsAppAccountType    `json:"accountType"`
	PrimaryPlatform TestingPrimaryPlatform `json:"primaryPlatform,omitempty"`
}
type TestingAccountMode struct {
	Session         string                  `json:"session"`
	AccountType     WhatsAppAccountType     `json:"accountType"`
	PrimaryPlatform *TestingPrimaryPlatform `json:"primaryPlatform"`
	Changed         bool                    `json:"changed"`
	UnlinkedDevices []int                   `json:"unlinkedDevices"`
}

func validateTestingMode(account WhatsAppAccountType, platform TestingPrimaryPlatform, required bool) error {
	if account == "" && !required {
		account = WhatsAppApp
	}
	if err := contractOne(string(account), "accountType", "whatsapp_app", "business_app", "meta_cloud", "meta_coexistence"); err != nil {
		return err
	}
	if platform != "" {
		if account == MetaCloud {
			return configuration("primaryPlatform", "Official API mode does not accept a phone platform.")
		}
		if err := contractOne(string(platform), "primaryPlatform", "android", "ios"); err != nil {
			return err
		}
	}
	return nil
}

// SetAccountMode changes a Test number's mode and unlinks its companions on a change.
func (r *Testing) SetAccountMode(ctx context.Context, session string, input TestingAccountModeRequest, o ...RequestOptions) (Response[TestingAccountMode], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[TestingAccountMode]{}, err
	}
	if err := contractText(session, "session", 1, 256); err != nil {
		return Response[TestingAccountMode]{}, err
	}
	if err := validateTestingMode(input.AccountType, input.PrimaryPlatform, true); err != nil {
		return Response[TestingAccountMode]{}, err
	}
	response, err := endpointBare[TestingAccountMode](ctx, r.t, "PUT", "/messaging/"+escaped(session)+"/phone/account-mode", nil, input, options(o), 200)
	if err != nil {
		return response, err
	}
	if contractOne(string(response.Data.AccountType), "accountType", "whatsapp_app", "business_app", "meta_cloud", "meta_coexistence") != nil {
		return response, campaignResponseError(response.Metadata)
	}
	if p := response.Data.PrimaryPlatform; p != nil && contractOne(string(*p), "primaryPlatform", "android", "ios") != nil {
		return response, campaignResponseError(response.Metadata)
	}
	return response, nil
}
