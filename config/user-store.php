<?php
/**
 * User store: data/users.json (id, email, name, picture, provider, provider_id, created_at).
 */
if (!function_exists('user_store_path')) {
    function user_store_path() {
        return dirname(__DIR__) . '/data/users.json';
    }
}

function user_store_load() {
    $path = user_store_path();
    if (!is_file($path)) return [];
    $raw = @file_get_contents($path);
    $data = $raw ? json_decode($raw, true) : null;
    return is_array($data) ? $data : [];
}

function user_store_save($users) {
    $path = user_store_path();
    $dir = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    return file_put_contents($path, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false;
}

function user_list_all() {
    return user_store_load();
}

function user_find_by_id($id) {
    $users = user_store_load();
    foreach ($users as $u) {
        if (isset($u['id']) && (string)$u['id'] === (string)$id) return $u;
    }
    return null;
}

function user_find_by_email($email) {
    $email = trim((string)$email);
    if ($email === '') return null;
    $users = user_store_load();
    foreach ($users as $u) {
        if (isset($u['email']) && strcasecmp(trim($u['email']), $email) === 0) return $u;
    }
    return null;
}

function user_find_by_provider($provider, $providerId) {
    $provider = trim((string)$provider);
    $providerId = trim((string)$providerId);
    if ($provider === '' || $providerId === '') return null;
    $users = user_store_load();
    foreach ($users as $u) {
        if (isset($u['provider'], $u['provider_id']) && $u['provider'] === $provider && (string)$u['provider_id'] === $providerId)
            return $u;
    }
    return null;
}

function user_create($data) {
    $users = user_store_load();
    $id = 'u_' . bin2hex(random_bytes(8));
    $user = [
        'id' => $id,
        'email' => isset($data['email']) ? trim((string)$data['email']) : '',
        'name' => isset($data['name']) ? trim((string)$data['name']) : '',
        'picture' => isset($data['picture']) ? trim((string)$data['picture']) : '',
        'provider' => isset($data['provider']) ? trim((string)$data['provider']) : 'email',
        'provider_id' => isset($data['provider_id']) ? trim((string)$data['provider_id']) : '',
        'created_at' => date('c'),
        'updated_at' => date('c'),
    ];
    if (isset($data['password']) && (string)$data['password'] !== '') {
        $user['password_hash'] = password_hash((string)$data['password'], PASSWORD_DEFAULT);
    }
    $users[] = $user;
    if (!user_store_save($users)) return null;
    return $user;
}

function user_update($id, $data) {
    $users = user_store_load();
    foreach ($users as $i => $u) {
        if (isset($u['id']) && (string)$u['id'] === (string)$id) {
            if (isset($data['email'])) $users[$i]['email'] = trim((string)$data['email']);
            if (isset($data['name'])) $users[$i]['name'] = trim((string)$data['name']);
            if (isset($data['picture'])) $users[$i]['picture'] = trim((string)$data['picture']);
            if (array_key_exists('provider', $data)) $users[$i]['provider'] = trim((string)$data['provider']);
            if (array_key_exists('provider_id', $data)) $users[$i]['provider_id'] = trim((string)$data['provider_id']);
            if (isset($data['password']) && (string)$data['password'] !== '') {
                $users[$i]['password_hash'] = password_hash((string)$data['password'], PASSWORD_DEFAULT);
            }
            $users[$i]['updated_at'] = date('c');
            return user_store_save($users) ? $users[$i] : null;
        }
    }
    return null;
}

function user_verify_password($email, $password) {
    $user = user_find_by_email($email);
    if (!$user || empty($user['password_hash'])) return null;
    return password_verify((string)$password, $user['password_hash']) ? $user : null;
}

function user_find_or_create($provider, $providerId, $email, $name = '', $picture = '') {
    $u = user_find_by_provider($provider, $providerId);
    if ($u) {
        user_update($u['id'], ['email' => $email, 'name' => $name, 'picture' => $picture]);
        return user_find_by_id($u['id']);
    }
    $byEmail = user_find_by_email($email);
    if ($byEmail) {
        user_update($byEmail['id'], ['name' => $name ?: $byEmail['name'], 'picture' => $picture ?: $byEmail['picture'], 'provider' => $provider, 'provider_id' => $providerId]);
        return user_find_by_id($byEmail['id']);
    }
    return user_create(['email' => $email, 'name' => $name, 'picture' => $picture, 'provider' => $provider, 'provider_id' => $providerId]);
}
