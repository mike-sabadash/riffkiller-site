<?php
/** Isolated test-server provider; never loaded by the application. */
class GoogleFixtureStream {
    public $context;
    private $body = '';
    private $offset = 0;
    public function stream_open($url, $mode, $options, &$openedPath) {
        $request = stream_context_get_options($this->context)['http'] ?? [];
        file_put_contents(__DIR__ . '/google-requests.jsonl', json_encode(['url' => $url, 'request' => $request]) . "\n", FILE_APPEND);
        if ($url === 'https://oauth2.googleapis.com/token') {
            parse_str($request['content'] ?? '', $form);
            $this->body = json_encode(($form['code'] ?? '') === 'invalid' ? ['error' => 'invalid_grant'] : ['access_token' => ($form['code'] ?? 'valid')]);
        } elseif ($url === 'https://openidconnect.googleapis.com/v1/userinfo') {
            $this->body = json_encode(['sub' => 'google-fixture-user', 'email' => 'linked@example.com', 'email_verified' => strpos($request['header'] ?? '', 'unverified') === false, 'name' => 'Linked User']);
        } else { return false; }
        return true;
    }
    public function stream_read($length) { $value = substr($this->body, $this->offset, $length); $this->offset += strlen($value); return $value; }
    public function stream_eof() { return $this->offset >= strlen($this->body); }
    public function stream_stat() { return []; }
}
stream_wrapper_unregister('https');
stream_wrapper_register('https', GoogleFixtureStream::class);
