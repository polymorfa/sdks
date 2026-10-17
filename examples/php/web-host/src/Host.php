<?php

declare(strict_types=1);

namespace PolymorfaExample;

use Polymorfa\{Credential,MessagingClient};
use Symfony\Component\HttpFoundation\{Cookie,JsonResponse,RedirectResponse,Request,Response};

/** Loopback demonstration account. Replace with live application authorization before deployment. */
final class Host
{
    private MessagingClient $client;
    private string $state;
    private string $origin;
    private string $session;
    private string $username;
    private string $password;

    public function __construct(private readonly \Closure $render)
    {
        $this->username = self::setting('EXAMPLE_APP_USERNAME');
        $this->password = self::setting('EXAMPLE_APP_PASSWORD');
        $this->session = self::setting('POLYMORFA_SESSION');
        $this->origin = self::setting('EXAMPLE_APP_ORIGIN');
        if (!preg_match('~^http://127\.0\.0\.1:\d+$~D', $this->origin)) {
            throw new \RuntimeException('Configure a loopback application origin.');
        }
        $this->state = self::setting('EXAMPLE_STATE_DIR');
        if (!str_starts_with($this->state, '/') || str_starts_with($this->state, '/tmp/')) {
            throw new \RuntimeException('Configure a persistent, private application state directory.');
        }
        self::directory($this->state.'/sessions');
        $this->client = new MessagingClient(Credential::projectToken(self::setting('POLYMORFA_PROJECT_TOKEN')), getenv('POLYMORFA_API_BASE_URL') ?: 'https://api.polymorfa.com');
    }

    public static function directory(string $path): void
    {
        if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
            throw new \RuntimeException('Application state is unavailable.');
        }
    }
    private static function setting(string $name): string
    {
        $value = getenv($name);
        if ($value === false || $value === '') {
            throw new \RuntimeException('Configure the application account, number and state.');
        }
        return $value;
    }
    private function authenticated(Request $request): bool
    {
        $cookie = $request->cookies->get('polymorfa_example_session');
        if (!is_string($cookie) || !preg_match('/^[a-f0-9]{64}$/D', $cookie)) {
            return false;
        }
        $path = $this->state.'/sessions/'.hash('sha256', $cookie);
        $data = is_file($path) ? json_decode((string)file_get_contents($path), true) : null;
        return is_array($data) && ($data['user'] ?? null) === 'local-app-user' && is_int($data['expires'] ?? null) && $data['expires'] > time();
    }
    private function json(array $value, int $status = 200): Response
    {
        return new JsonResponse($value, $status, ['Cache-Control' => 'no-store, private','Vary' => 'Cookie']);
    }
    private function html(Request $request, bool $authenticated): Response
    {
        if ($request->headers->get('HX-Request') !== 'true' && $request->getPathInfo() !== '/') {
            return new RedirectResponse('/');
        }
        return new Response(($this->render)($authenticated, $request->headers->get('HX-Request') === 'true'), 200, ['Cache-Control' => 'no-store, private']);
    }
    public function handle(Request $request): Response
    {
        $path = $request->getPathInfo();
        $methods = ['/' => 'GET','/api/login' => 'POST','/api/logout' => 'POST','/api/polymorfa/token' => 'POST','/api/polymorfa/connect' => 'POST','/api/polymorfa/history/conversations' => 'GET'];
        if (!isset($methods[$path])) {
            return $this->json(['error' => 'not_found'], 404);
        }
        if ($request->getMethod() !== $methods[$path]) {
            $response = $this->json(['error' => 'method_not_allowed'], 405);
            $response->headers->set('Allow', $methods[$path]);
            return $response;
        }
        if ($request->getMethod() === 'POST' && $request->headers->get('Origin') !== $this->origin) {
            return $this->json(['error' => 'invalid_origin'], 403);
        }
        if ($path === '/') {
            return $this->html($request, $this->authenticated($request));
        }
        if ($path === '/api/login') {
            if (strlen($request->getContent()) > 16384) {
                return $this->json(['error' => 'invalid_sign_in'], 400);
            }
            $username = $request->request->get('username');
            $password = $request->request->get('password');
            if (!is_string($username) || !is_string($password) || !hash_equals(hash('sha256', $this->username), hash('sha256', $username)) || !hash_equals(hash('sha256', $this->password), hash('sha256', $password))) {
                return $this->json(['error' => 'sign_in_failed'], 401);
            }
            $files = glob($this->state.'/sessions/*') ?: [];
            foreach ($files as $file) {
                if (filemtime($file) < time() - 1800) {
                    unlink($file);
                }
            }
            if (count(glob($this->state.'/sessions/*') ?: []) >= 128) {
                return $this->json(['error' => 'session_limit'], 429);
            }
            $cookie = bin2hex(random_bytes(32));
            $file = $this->state.'/sessions/'.hash('sha256', $cookie);
            $previous = umask(0077);
            try {
                if (file_put_contents($file, json_encode(['user' => 'local-app-user','expires' => time() + 1800], JSON_THROW_ON_ERROR), LOCK_EX) === false) {
                    throw new \RuntimeException('Session storage failed.');
                }
            } finally {
                umask($previous);
            }
            $response = $this->html($request, true);
            $response->headers->setCookie(Cookie::create('polymorfa_example_session', $cookie, time() + 1800, '/', httpOnly:true, sameSite:Cookie::SAMESITE_STRICT));
            return $response;
        }
        if ($path === '/api/logout') {
            $cookie = $request->cookies->get('polymorfa_example_session');
            if (is_string($cookie) && preg_match('/^[a-f0-9]{64}$/D', $cookie)) {
                $file = $this->state.'/sessions/'.hash('sha256', $cookie);
                if (is_file($file)) {
                    unlink($file);
                }
            }
            $response = $this->html($request, false);
            $response->headers->clearCookie('polymorfa_example_session', '/', httpOnly:true, sameSite:Cookie::SAMESITE_STRICT);
            return $response;
        }
        if (!$this->authenticated($request)) {
            return $this->json(['error' => 'sign_in_required'], 401);
        }
        if ($path === '/api/polymorfa/history/conversations') {
            return $this->json(['data' => [],'nextCursor' => null]);
        }
        try {
            if ($path === '/api/polymorfa/connect') {
                return $this->json($this->client->quickLinks->create(['purpose' => 'add_connection','session' => $this->session,'addConnection' => 'linked_devices','connectionGoal' => 'hybrid'])->data);
            }
            $result = $this->client->clientTokens->mint(['ephemeralId' => 'example:local-app-user','session' => $this->session,'ttlSeconds' => 600]);
            $token = $result->data['data'];
            $expires = strtotime($token['expiresAt']);
            if ($expires === false || $expires <= time() || !str_starts_with($token['token'], 'pmfa_ct_')) {
                return $this->json(['error' => 'invalid_browser_grant'], 502);
            }
            return $this->json(['value' => $token['token'],'audience' => 'browser','expiresAt' => $expires * 1000,'scopes' => ['read_messages','connect_whatsapp'],'grant' => ['session' => $this->session,'conversations' => [],'allow' => ['read_messages','connect_whatsapp']]]);
        } catch (\Throwable) {
            return $this->json(['error' => 'browser_access_unavailable'],502);
        }
    }
}
