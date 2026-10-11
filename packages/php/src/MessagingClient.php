<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\ClientInterface;
use Polymorfa\Resources\{BanSafe, Channels, QuickReplies, Users, Business, ClientTokens, Groups, Chats, Contacts, Identities, Labels, Profile, Privacy, Presence, Media, Messages, QuickLinks, Sessions, Voip, Webhooks};

final readonly class MessagingClient
{
    public BanSafe $banSafe;
    public Channels $channels;
    public QuickReplies $quickReplies;
    public Users $users;
    public Business $business;
    public ClientTokens $clientTokens;
    public Groups $groups;
    public Contacts $contacts;
    public Identities $identities;
    public Labels $labels;
    public Profile $profile;
    public Privacy $privacy;
    public Presence $presence;
    public Messages $messages;
    public Sessions $sessions;
    public QuickLinks $quickLinks;
    public Webhooks $webhooks;
    public Chats $chats;
    public Media $media;
    public Voip $voip;
    public RawClient $raw;

    public function __construct(
        Credential $credential,
        string $baseUrl = 'https://api.polymorfa.com',
        string $apiVersion = HttpTransport::API_VERSION,
        float $timeout = 30,
        int $maxNetworkRetries = 2,
        ?string $proxy = null,
        ?ClientInterface $http = null
    ) {
        $transport = new HttpTransport($credential, $baseUrl, $apiVersion, $timeout, $maxNetworkRetries, $proxy, $http);
        $this->banSafe = new BanSafe($transport);
        $this->channels = new Channels($transport);
        $this->quickReplies = new QuickReplies($transport);
        $this->users = new Users($transport);
        $this->business = new Business($transport);
        $this->clientTokens = new ClientTokens($transport);
        $this->groups = new Groups($transport);
        $this->contacts = new Contacts($transport);
        $this->identities = new Identities($transport);
        $this->labels = new Labels($transport);
        $this->profile = new Profile($transport);
        $this->privacy = new Privacy($transport);
        $this->presence = new Presence($transport);
        $this->messages = new Messages($transport);
        $this->sessions = new Sessions($transport);
        $this->quickLinks = new QuickLinks($transport);
        $this->webhooks = new Webhooks($transport);
        $this->chats = new Chats($transport);
        $this->media = new Media($transport);
        $this->voip = new Voip($transport);
        $this->raw = new RawClient($transport);
    }
}
