<?php
/**
 * Коллекции: метаданные в data/collections.json, состав — по полю collectionIds у риффов.
 */

require_once __DIR__ . '/image-variants.php';
require_once __DIR__ . '/riff-visibility.php';

function rk_collections_meta_path(): string
{
    return dirname(__DIR__) . '/data/collections.json';
}

function rk_riffs_path(): string
{
    return dirname(__DIR__) . '/data/riffs.json';
}

/** @return array<int, array<string,mixed>> */
function rk_collections_load_meta(): array
{
    $file = rk_collections_meta_path();
    if (!is_file($file)) {
        return [];
    }
    $data = json_decode(file_get_contents($file), true);
    return is_array($data) ? $data : [];
}

/** @return array<int, array<string,mixed>> */
function rk_riffs_load(): array
{
    $file = rk_riffs_path();
    if (!is_file($file)) {
        return [];
    }
    $data = json_decode(file_get_contents($file), true);
    return is_array($data) ? $data : [];
}

/**
 * Список коллекций для API/фронта: id, name, imageUrl, bannerUrl, isFavorite, riffs[], videoCount.
 *
 * @return array<int, array<string,mixed>>
 */
function rk_collections_build_list(): array
{
    $meta = rk_collections_load_meta();
    // Drafts do not count: a collection with only drafts stays empty and hidden on the home page.
    $riffs = riff_public_list(rk_riffs_load());

    $out = [];
    foreach ($meta as $c) {
        if (!is_array($c) || !isset($c['id'])) {
            continue;
        }
        $cid = (int) $c['id'];
        $riffIds = [];
        foreach ($riffs as $r) {
            if (!is_array($r) || !isset($r['id'])) {
                continue;
            }
            $ids = isset($r['collectionIds']) && is_array($r['collectionIds']) ? $r['collectionIds'] : [];
            foreach ($ids as $x) {
                if ((int) $x === $cid) {
                    $riffIds[] = (int) $r['id'];
                    break;
                }
            }
        }
        sort($riffIds);
        $out[] = [
            'id' => $cid,
            'name' => (string) ($c['name'] ?? ''),
            'imageUrl' => (string) ($c['imageUrl'] ?? 'assets/img/collections-1.png'),
            'bannerUrl' => (string) ($c['bannerUrl'] ?? ''),
            'imageSrcset' => image_srcset((string) ($c['imageUrl'] ?? '')),
            'bannerSrcset' => image_srcset((string) ($c['bannerUrl'] ?? '')),
            'isFavorite' => !empty($c['isFavorite']),
            'riffs' => $riffIds,
            'videoCount' => count($riffIds),
        ];
    }

    return $out;
}

/** Убрать id коллекции из всех риффов (после удаления коллекции). */
function rk_collections_strip_id_from_all_riffs(int $collectionId): bool
{
    $file = rk_riffs_path();
    if (!is_file($file)) {
        return true;
    }
    $list = json_decode(file_get_contents($file), true);
    if (!is_array($list)) {
        return true;
    }
    $changed = false;
    foreach ($list as $i => $r) {
        if (!is_array($r) || !isset($r['collectionIds']) || !is_array($r['collectionIds'])) {
            continue;
        }
        $new = array_values(array_filter($r['collectionIds'], function ($x) use ($collectionId) {
            return (int) $x !== $collectionId;
        }));
        if (count($new) !== count($r['collectionIds'])) {
            $list[$i]['collectionIds'] = $new;
            $changed = true;
        }
    }
    if (!$changed) {
        return true;
    }
    return file_put_contents($file, json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false;
}
