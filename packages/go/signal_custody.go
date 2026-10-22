package polymorfa

import "context"

// SignalCustodyResource controls future reservation defaults, never existing Numbers.
type SignalCustodyResource struct {
	t         *transport
	projectID string
}

func (c *ProjectClient) SignalCustody() *SignalCustodyResource {
	return &SignalCustodyResource{c.t, c.projectID}
}
func custodyPath(project string, customer *string) string {
	p := "/platform/projects/" + escaped(project)
	if customer != nil {
		p += "/customers/" + escaped(*customer)
	}
	return p + "/signal-custody"
}
func custodyCall(ctx context.Context, t *transport, project string, customer *string, body any, opts []RequestOptions) (Response[Envelope[SignalCustodyDefault]], error) {
	checks := []error{contractUUID(project, "projectId")}
	if customer != nil {
		checks = append(checks, contractUUID(*customer, "customerId"))
	}
	method := "GET"
	switch b := body.(type) {
	case ProjectSignalCustodyUpdate:
		method = "PUT"
		checks = append(checks, validateCustody(b.ExpectedRevision, &b.SignalModeDefault, false))
	case CustomerSignalCustodyUpdate:
		method = "PUT"
		checks = append(checks, validateCustody(b.ExpectedRevision, b.SignalModeDefault.Value, true))
	}
	return campaignDo[SignalCustodyDefault](ctx, t, method, custodyPath(project, customer), nil, body, opts, false, checks...)
}
func (r *Projects) GetSignalCustody(ctx context.Context, project string, o ...RequestOptions) (Response[Envelope[SignalCustodyDefault]], error) {
	return custodyCall(ctx, r.t, project, nil, nil, o)
}
func (r *Projects) UpdateSignalCustody(ctx context.Context, project string, b ProjectSignalCustodyUpdate, o ...RequestOptions) (Response[Envelope[SignalCustodyDefault]], error) {
	return custodyCall(ctx, r.t, project, nil, b, o)
}
func (r *Customers) GetSignalCustody(ctx context.Context, project, customer string, o ...RequestOptions) (Response[Envelope[SignalCustodyDefault]], error) {
	return custodyCall(ctx, r.t, project, &customer, nil, o)
}
func (r *Customers) UpdateSignalCustody(ctx context.Context, project, customer string, b CustomerSignalCustodyUpdate, o ...RequestOptions) (Response[Envelope[SignalCustodyDefault]], error) {
	return custodyCall(ctx, r.t, project, &customer, b, o)
}
func (r *SignalCustodyResource) Retrieve(ctx context.Context, o ...RequestOptions) (Response[Envelope[SignalCustodyDefault]], error) {
	return custodyCall(ctx, r.t, r.projectID, nil, nil, o)
}
func (r *SignalCustodyResource) Update(ctx context.Context, b ProjectSignalCustodyUpdate, o ...RequestOptions) (Response[Envelope[SignalCustodyDefault]], error) {
	return custodyCall(ctx, r.t, r.projectID, nil, b, o)
}
func (r *SignalCustodyResource) RetrieveCustomer(ctx context.Context, customer string, o ...RequestOptions) (Response[Envelope[SignalCustodyDefault]], error) {
	return custodyCall(ctx, r.t, r.projectID, &customer, nil, o)
}
func (r *SignalCustodyResource) UpdateCustomer(ctx context.Context, customer string, b CustomerSignalCustodyUpdate, o ...RequestOptions) (Response[Envelope[SignalCustodyDefault]], error) {
	return custodyCall(ctx, r.t, r.projectID, &customer, b, o)
}
