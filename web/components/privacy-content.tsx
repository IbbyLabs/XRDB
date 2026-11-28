'use client';

import { BRAND_PRIVACY_EMAIL, BRAND_DISCORD_DM_URL } from '@/lib/brand';
import { useT, useRich } from '@/lib/i18n';
import type { RichTags } from '@/lib/i18n';

const LAST_UPDATED = '28 November 2026';

const CONTACT: RichTags = {
  email: c => <a href={`mailto:${BRAND_PRIVACY_EMAIL}`}>{c}</a>,
  dm: c => <a href={BRAND_DISCORD_DM_URL} target="_blank" rel="noreferrer">{c}</a>,
};

export function PrivacyContent() {
  const t = useT();
  const rich = useRich();
  return (
    <div className="page-inner">
      <div className="page-head">
        <h1 className="page-title">{t('Privacy')}</h1>
        <p className="page-sub">{t('What XRDB stores, what it sends to other services, and how to remove it.')}</p>
      </div>

      <div className="help">
        <p className="help-note">{t('Last updated {date}.', { date: LAST_UPDATED })}</p>

        <section aria-labelledby="privacy-who">
          <h2 id="privacy-who">{t('Who this covers')}</h2>
          <p>{t('This policy covers XRDB at extendedratings.com, which IbbyLabs runs. An XRDB instance run by someone else, such as a self-hosted one, keeps its data on that operator’s server and under their control.')}</p>
          <p>{t('XRDB has no user accounts. It does not ask for your name or email address, sets no cookies, and runs no analytics or advertising.')}</p>
        </section>

        <section aria-labelledby="privacy-profiles">
          <h2 id="privacy-profiles">{t('Profiles')}</h2>
          <p>{t('Saving a profile stores your artwork settings, its name and alias if you give them, the title the configurator opens it on, and when it was created and last changed.')}</p>
          <p>{t('The profile password is stored only as a bcrypt hash, so XRDB cannot read it back.')}</p>
          <p>{t('API keys you add for rating and artwork services are encrypted before they are stored, are used only for that profile’s artwork, and are never sent back to the browser.')}</p>
          <p>{t('Anyone with a profile’s ID or alias can render artwork with it. The password protects changes and deletion, not viewing.')}</p>
          <p>{t('A profile is kept until it is deleted. If an owner is locked out, the instance operator can set a new password, which also clears the profile’s API keys.')}</p>
        </section>

        <section aria-labelledby="privacy-trakt">
          <h2 id="privacy-trakt">{t('Trakt')}</h2>
          <p>{t('Linking Trakt is optional. It is used only to draw a watched-progress bar on the owner’s movie posters, and needs a profile with a password.')}</p>
          <p>{t('Linking uses Trakt’s device sign-in: you enter a code at Trakt and approve XRDB there. XRDB never sees your Trakt password.')}</p>
          <p>{t('XRDB stores the access and refresh tokens Trakt issues with the profile, encrypted with AES-256-GCM. They are never included in the profile’s settings, an export, or any response from XRDB.')}</p>
          <p>{t('XRDB only reads from Trakt: the movies you have watched and the movies you have paused part-way through. It never writes to your Trakt account, so it adds no history, check-ins, ratings or lists.')}</p>
          <p>{t('Your progress is kept in the server’s memory for a few minutes at a time, or for up to six hours while Trakt cannot be reached. Posters drawn with a bar are cached like other artwork.')}</p>
          <p>{t('The bar only appears on artwork links that use the profile’s ID. Its alias, shared links and the configurator preview never show it.')}</p>
          <p>{t('Anyone with your profile’s ID link can see your watched progress on its posters, so share the alias, not the ID.')}</p>
          <p>{t('To unlink, press Unlink Trakt in the configurator’s Display tab. XRDB asks Trakt to revoke the token and deletes its copy. You can also revoke XRDB’s access from your Trakt account settings.')}</p>
          <p>{t('XRDB uses Trakt but is not endorsed or certified by Trakt.')}</p>
        </section>

        <section aria-labelledby="privacy-cache">
          <h2 id="privacy-cache">{t('Cached artwork')}</h2>
          <p>{t('XRDB caches the artwork it renders, in memory and on disk, under a one-way digest of the title, the image type and the look. Cached artwork is kept for up to 72 hours by default and is rendered again when next requested.')}</p>
          <p>{t('Ratings and other title details are cached per title, not per person.')}</p>
        </section>

        <section aria-labelledby="privacy-logs">
          <h2 id="privacy-logs">{t('Request logs')}</h2>
          <p>{t('Each request writes one line to the server log: the time, the requesting address, the path, the query string with keys, tokens and passwords replaced, the status, size and duration of the response, and the user agent, cut to 120 characters.')}</p>
          <p>{t('Logs roll over by size and are cleared whenever XRDB is updated, so they are usually kept for about two days.')}</p>
          <p>{t('Profile events, such as linking or unlinking Trakt, are logged with the profile ID. Requests per address are counted in memory to enforce rate limits.')}</p>
        </section>

        <section aria-labelledby="privacy-services">
          <h2 id="privacy-services">{t('Other services')}</h2>
          <p>{t('To build artwork, the server asks outside services for a title’s artwork, ratings and details, such as TMDB, Fanart.tv, MDBList, OMDb, Trakt, SIMKL, AniList, Kitsu, MyAnimeList, AlloCiné, Filmweb, Wikidata and PMDB. These requests name the title and carry XRDB’s API key, or your own if your profile has one. They do not include your address or anything else about you.')}</p>
          <p>{t('For a linked profile, XRDB reads your progress from Trakt with your token, as described above.')}</p>
          <p>{t('The one-click AIOMetadata install sends your AIOMetadata ID and password to the AIOMetadata instance you choose, to add XRDB’s artwork links to your configuration there. XRDB does not store them.')}</p>
          <p>{t('The hosted instance is served through Cloudflare, so your requests pass through Cloudflare on their way to XRDB.')}</p>
        </section>

        <section aria-labelledby="privacy-browser">
          <h2 id="privacy-browser">{t('In your browser')}</h2>
          <p>{t('The configurator keeps some settings in your browser’s storage: the theme, the interface language, recently opened profiles, pinned titles, and the work in progress in the current tab.')}</p>
          <p>{t('With Remember on this device turned on, it also keeps profile passwords and the instance key there. Turning it off removes them.')}</p>
        </section>

        <section aria-labelledby="privacy-delete">
          <h2 id="privacy-delete">{t('Deleting your data')}</h2>
          <p>{t('Open the profile in the configurator’s Profile tab, press Delete, then press again to confirm. A password-protected profile needs its password.')}</p>
          <p>{t('Deleting also disconnects Trakt: XRDB asks Trakt to revoke the token, then removes the profile, its API keys and its Trakt tokens from the database. Artwork already cached for the profile expires on its own.')}</p>
        </section>

        <section aria-labelledby="privacy-contact">
          <h2 id="privacy-contact">{t('Contact')}</h2>
          <p>{rich('For questions about your data, or anything you cannot do yourself, email <email>team@ibbylabs.dev</email> or <dm>message Ibby on Discord</dm>.', CONTACT)}</p>
        </section>
      </div>
    </div>
  );
}
