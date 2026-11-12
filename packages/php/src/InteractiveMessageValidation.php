<?php

declare(strict_types=1);

namespace Polymorfa;

/** Structural checks for the separately pinned interactive supplement. */
final class InteractiveMessageValidation
{
    /** @param array<array-key,mixed> $content */
    public static function validate(array $content): void
    {
        $buttons = $content['buttons'] ?? null;
        if (is_array($buttons) && array_key_exists('media', $buttons)) {
            $media = self::source($buttons['media']);
            $kind = $media['type'] ?? null;
            if (array_key_exists('title', $buttons) || !in_array($kind, ['image','video','document'], true)) {
                throw new ConfigurationException('media');
            }
            if ((array_key_exists('filename', $media) && $kind !== 'document') || (array_key_exists('thumbnail', $media) && $kind !== 'video')) {
                throw new ConfigurationException('media');
            }
        }
        $carousel = $content['carousel'] ?? null;
        if (is_array($carousel)) {
            $cards = $carousel['cards'] ?? null;
            if (!is_array($cards) || !array_is_list($cards) || count($cards) < 2 || count($cards) > 10) {
                throw new ConfigurationException('cards');
            }
            foreach ($cards as $card) {
                if (!is_array($card) || array_key_exists('footer', $card) || (array_key_exists('image', $card) === array_key_exists('video', $card))) {
                    throw new ConfigurationException('card');
                }
                self::source(array_key_exists('image', $card) ? $card['image'] : $card['video']);
            }
        }
    }
    /** @return array<array-key,mixed> */
    private static function source(mixed $media): array
    {
        if (!is_array($media) || (array_key_exists('url', $media) === array_key_exists('base64', $media))) {
            throw new ConfigurationException('media');
        }
        return $media;
    }
}
