#[allow(dead_code)]
mod support;
use polymorfa_sdk::{templates::*, RequestOptions};
use serde_json::json;
fn definition() -> TemplateDefinition {
    serde_json::from_value(definition_json()).unwrap()
}
fn definition_json() -> serde_json::Value {
    json!({"version":1,"kind":"standard","category":"UTILITY","language":"en_US","header":{"format":"text","text":"Hello"},"body":"Hello {{name}}","buttons":[{"type":"url","text":"Visit","url":"https://example.com"},{"type":"copy_code","example":"123"}],"variables":[{"name":"name","type":"text","example":"Alex"}]})
}
fn project_template() -> serde_json::Value {
    json!({"id":"template","name":"hello","category":"UTILITY","language":"en_US","status":"draft","kind":"standard","definition":definition_json(),"sampleValues":null,"cloudLinks":[{"id":"cloud"}],"createdAt":1000,"updatedAt":2000})
}
fn cloud_template() -> serde_json::Value {
    json!({"id":"template","tenantId":"tenant","session":"support","wabaId":"waba","name":"hello","language":"en_US","category":"UTILITY","status":"APPROVED","components":[{"type":"BODY","text":"Hello"}],"metaTemplateId":"meta","qualityScore":"GREEN","createdAt":"2026-10-10","updatedAt":"2026-10-11"})
}
#[tokio::test]
async fn project_draft_templates_definition_and_operations_native_wire() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/projects/project/templates",
        None,
        json!({"success":true,"data":[project_template()]}),
        client
            .templates()
            .list("project", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/projects/project/templates",
        Some(json!({"name":"hello","definition":definition_json()})),
        json!({"success":true,"data":project_template()}),
        client.templates().create(
            "project",
            &CreateProjectTemplateRequest {
                name: "hello".into(),
                definition: definition(),
                sample_values: None
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/projects/project/templates/template",
        None,
        json!({"success":true,"data":project_template()}),
        client
            .templates()
            .retrieve("project", "template", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PATCH",
        "/messaging/projects/project/templates/template",
        Some(json!({"name":"hello","status":"draft"})),
        json!({"success":true,"data":project_template()}),
        client.templates().update(
            "project",
            "template",
            &UpdateProjectTemplateRequest {
                name: Some("hello".into()),
                status: Some("draft".into()),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/projects/project/templates/template",
        None,
        json!({"success":true}),
        client
            .templates()
            .delete("project", "template", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/projects/project/templates/template/preview",
        Some(json!({"surface":"sandbox","values":{"name":"Alex"}})),
        json!({"success":true,"data":{"text":"Hello Alex","warnings":[]}}),
        client.templates().preview(
            "project",
            "template",
            &PreviewProjectTemplateRequest {
                surface: Some(TemplateSurface::Sandbox),
                values: Some([("name".into(), "Alex".into())].into())
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/projects/project/templates/template/submit",
        Some(json!({"session":"support"})),
        json!({"success":true,"data":{"accepted":true,"name":"hello"}}),
        client.templates().submit(
            "project",
            "template",
            &SubmitProjectTemplateRequest {
                session: "support".into()
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn official_api_templates_native_wire() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/templates",
        None,
        json!({"success":true,"data":[cloud_template()]}),
        client
            .cloud_templates()
            .list("support", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/templates/hello?language=en_US",
        None,
        json!({"success":true,"data":cloud_template()}),
        client.cloud_templates().retrieve(
            "support",
            "hello",
            Some("en_US"),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/templates",
        Some(
            json!({"name":"hello","language":"en_US","category":"UTILITY","components":[{"type":"BODY","text":"Hello"}]})
        ),
        json!({"success":true,"data":cloud_template()}),
        client.cloud_templates().create(
            "support",
            &CreateCloudTemplateRequest {
                name: "hello".into(),
                language: "en_US".into(),
                category: TemplateCategory::Utility,
                components: vec![json!({"type":"BODY","text":"Hello"})]
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "PATCH",
        "/messaging/support/templates/hello?language=en_US",
        Some(json!({"components":[{"type":"BODY","text":"Hello"}]})),
        json!({"success":true,"data":{"accepted":true,"name":"hello","language":"en_US"}}),
        client.cloud_templates().update(
            "support",
            "hello",
            &EditCloudTemplateRequest {
                components: vec![json!({"type":"BODY","text":"Hello"})]
            },
            Some("en_US"),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/support/templates/hello",
        None,
        json!({"success":true}),
        client
            .cloud_templates()
            .delete("support", "hello", RequestOptions::default())
    );
}
#[test]
fn typed_template_definition_variants_preserve_closed_shapes() {
    for value in [
        json!({"format":"none"}),
        json!({"format":"location","example":{"latitude":1.0,"longitude":2.0,"address":"Street"}}),
        json!({"format":"image","example":"https://example.com/image"}),
        json!({"format":"video","example":"https://example.com/video"}),
        json!({"format":"document","example":"https://example.com/document","filename":"file.pdf"}),
    ] {
        let header: TemplateHeader = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(header).unwrap(), value);
    }
    assert!(serde_json::from_value::<TemplateDefinitionVersion>(json!(2)).is_err());
}
