use gloo_net::http::Request;
use serde::Serialize;
use wasm_bindgen::prelude::*;
use web_sys::HtmlInputElement;
use yew::prelude::*;
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace=window,js_name=startPolymorfa)]
    fn start_polymorfa();
    #[wasm_bindgen(js_namespace=window,js_name=stopPolymorfa)]
    fn stop_polymorfa();
}
#[derive(Serialize)]
struct Login {
    username: String,
    password: String,
}
#[function_component(App)]
fn app() -> Html {
    let username = use_state(String::new);
    let password = use_state(String::new);
    let logged_in = use_state(|| false);
    let pending = use_state(|| false);
    let error = use_state(String::new);
    {
        let logged_in = logged_in.clone();
        use_effect_with(*logged_in, move |signed_in| {
            if *signed_in {
                start_polymorfa();
            }
            || {}
        });
    }
    {
        let logged_in = logged_in.clone();
        use_effect_with((), move |_| {
            wasm_bindgen_futures::spawn_local(async move {
                if let Ok(response) = Request::get("/api/polymorfa/conversation").send().await {
                    if response.status() == 200 {
                        logged_in.set(true);
                    }
                }
            });
            || {}
        });
    }
    let onusername = {
        let username = username.clone();
        Callback::from(move |event: InputEvent| {
            username.set(event.target_unchecked_into::<HtmlInputElement>().value());
        })
    };
    let onpassword = {
        let password = password.clone();
        Callback::from(move |event: InputEvent| {
            password.set(event.target_unchecked_into::<HtmlInputElement>().value());
        })
    };
    let submit = {
        let username = username.clone();
        let password = password.clone();
        let logged_in = logged_in.clone();
        let pending = pending.clone();
        let error = error.clone();
        Callback::from(move |event: SubmitEvent| {
            event.prevent_default();
            if *pending {
                return;
            }
            pending.set(true);
            error.set(String::new());
            let input = Login {
                username: (*username).clone(),
                password: (*password).clone(),
            };
            let logged_in = logged_in.clone();
            let pending = pending.clone();
            let error = error.clone();
            let password = password.clone();
            wasm_bindgen_futures::spawn_local(async move {
                let response = Request::post("/api/login")
                    .header("content-type", "application/json")
                    .body(serde_json::to_string(&input).unwrap())
                    .unwrap()
                    .send()
                    .await;
                password.set(String::new());
                pending.set(false);
                match response {
                    Ok(response) if response.status() == 204 => logged_in.set(true),
                    Ok(_) => {
                        error.set("Sign-in failed. Check your local example credentials.".into())
                    }
                    Err(_) => error.set("Cannot reach the application server.".into()),
                }
            });
        })
    };
    let logout = {
        let logged_in = logged_in.clone();
        let error = error.clone();
        Callback::from(move |_| {
            let logged_in = logged_in.clone();
            let error = error.clone();
            wasm_bindgen_futures::spawn_local(async move {
                match Request::post("/api/logout").send().await {
                    Ok(response) if response.status() == 204 => {
                        stop_polymorfa();
                        logged_in.set(false);
                    }
                    _ => error.set(
                        "Cannot sign out. Retry when the application server is reachable.".into(),
                    ),
                }
            });
        })
    };
    html! {<main><h1>{"Polymorfa in Yew"}</h1>{if *logged_in {html!{<section aria-label="WhatsApp workspace"><button type="button" onclick={logout}>{"Sign out"}</button><p role="alert">{(*error).clone()}</p><p id="transport-label"/><p>{"Rust SDK. Text messages use the server-assigned number and recipient. Conversation state lasts until this example server stops."}</p><p id="native-status" role="status"/><pmfa-inbox/></section>}}else{html!{<form method="post" action="/api/login" onsubmit={submit}><h2>{"Sign in to the local example"}</h2><label for="username">{"Username"}</label><input id="username" name="username" autocomplete="username" required=true value={(*username).clone()} oninput={onusername}/><label for="password">{"Password"}</label><input id="password" name="password" type="password" autocomplete="current-password" required=true value={(*password).clone()} oninput={onpassword}/><button type="submit" disabled={*pending}>{if *pending{"Signing in…"}else{"Sign in"}}</button><p role="alert">{(*error).clone()}</p></form>}}}</main>}
}
fn main() {
    yew::Renderer::<App>::new().render();
}
