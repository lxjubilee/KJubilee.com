import LegalPage from '../_legal-page';

export const metadata = {
    title: 'Terms of Use — kJubilee.com',
    description: 'The terms you agree to when you use kJubilee.com.',
    alternates: { canonical: '/terms' },
    icons: { icon: '/images/members/JubileeInspire-Circle-200.png' },
};

/*
 * kJubilee's own Terms of Use.
 *
 * These used to link to www.jubileeinspire.com/help/terms, which handed a
 * reader to another company's document in the middle of creating an account
 * here — and asked them to agree to it. The sign-up form will not create an
 * account without this consent, so the document it points at has to be the one
 * that actually governs this service.
 *
 * Every factual claim below was checked against the code rather than assumed:
 * streaming with no downloads, no payment of any kind (there is no billing in
 * this codebase, so there are no payment terms to write), sign-in by kJubilee
 * password or Jubilee ID, and listener submissions limited to the comment and
 * voicemail paths that exist. If the service gains a feature, this page is part
 * of shipping it.
 */
export default function Page() {
    return (
        <LegalPage
            eyebrow="Legal"
            title="Terms of Use"
            effective="27 August 2026"
            updated="27 August 2026"
            lede={
                <>These terms are the agreement between you and Jubilee Software, Inc. for your use of
                kJubilee.com. Please read them — by creating an account or listening, you accept them.</>
            }
        >
            <h2>1. Who we are</h2>
            <p>
                kJubilee.com (&ldquo;kJubilee&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by
                <strong> Jubilee Software, Inc.</strong> It is a Christian internet radio service carrying
                the Heavenly Modulation (HM) band — a set of stations broadcasting worship, teaching and
                family programming from the Inspire Family catalogue.
            </p>
            <p>
                These terms cover kJubilee.com and its subdomains. Other Jubilee Software properties have
                their own terms; agreeing to these does not agree you to theirs.
            </p>

            <h2>2. The service</h2>
            <p>
                kJubilee streams audio to your browser. It is <strong>listening only</strong>: the service
                does not offer downloads, and the recordings it carries are not made available as files for
                you to keep.
            </p>
            <p>
                Stations, schedules and the music in rotation change constantly. Programming is built and
                published daily, and we may add, renumber, re-format or retire a frequency at any time
                without notice. Nothing here promises that a particular station, programme or recording
                will remain available.
            </p>
            <p>
                <strong>kJubilee is free to use.</strong> We do not charge for an account or for listening,
                and we do not ask you for payment details.
            </p>

            <h2>3. Your account</h2>
            <p>
                You can listen without an account. An account lets you save stations, follow artists and
                albums, and keep those choices across devices.
            </p>
            <ul>
                <li>
                    You may sign in with a kJubilee password or with your <strong>Jubilee ID</strong>, the
                    single sign-on shared across Jubilee Software sites. If you use a Jubilee ID, that
                    service&rsquo;s own terms govern the identity itself; these terms still govern kJubilee.
                </li>
                <li>
                    Give accurate details, and keep your email address current — it is how we reach you
                    about your account and how you recover access.
                </li>
                <li>
                    Your credentials are yours. Keep them to yourself, and tell us promptly if you believe
                    someone else has used your account.
                </li>
                <li>
                    An account is for one person. Do not share, sell or transfer it.
                </li>
                <li>
                    If you are under 13, please do not create an account. Some of our stations are made for
                    children, and a parent or guardian should hold the account and supervise its use.
                </li>
            </ul>

            <h2>4. Acceptable use</h2>
            <p>When using kJubilee, please do not:</p>
            <ul>
                <li>
                    Capture, record, rebroadcast, republish or redistribute the audio, in whole or in part,
                    or make it available to others in any form.
                </li>
                <li>
                    Use automated means to scrape, crawl, bulk-download or mirror the service, its schedules
                    or its catalogue.
                </li>
                <li>
                    Attempt to reach parts of the service you have not been given access to, interfere with
                    its operation, or probe, scan or test its security.
                </li>
                <li>
                    Send us unlawful, abusive, hateful, harassing, deceptive or infringing content through
                    any feature that accepts submissions.
                </li>
                <li>
                    Misrepresent who you are, or use the service to impersonate anyone.
                </li>
                <li>
                    Use the service in any way that breaks the law where you are.
                </li>
            </ul>

            <h2>5. Music, recordings and everything else on the site</h2>
            <p>
                The recordings, artwork, station names, written material, design and software on kJubilee
                are owned by Jubilee Software, Inc. or its licensors and artists, and are protected by
                copyright and other rights.
            </p>
            <p>
                We grant you a personal, non-exclusive, non-transferable, revocable licence to listen to the
                service for your own private, non-commercial enjoyment. That licence does not let you
                broadcast our streams publicly, play them as background audio in a commercial premises, or
                use any recording in your own content without our written permission.
            </p>
            <p>
                &ldquo;kJubilee&rdquo;, &ldquo;Heavenly Modulation&rdquo;, the Inspire Family artist names
                and the associated logos are marks of Jubilee Software, Inc. These terms do not give you
                permission to use them.
            </p>

            <h2>6. What you send us</h2>
            <p>
                Some parts of kJubilee invite a response — you can react to what is playing, leave a written
                comment about a segment, or record a short voice message for a station.
            </p>
            <ul>
                <li>
                    You keep ownership of what you send. You give us a worldwide, royalty-free licence to
                    store it, read it, and use it to run and improve the service — including reading a
                    comment to decide what to play more of.
                </li>
                <li>
                    <strong>A voice message may be broadcast.</strong> Recording one and sending it to a
                    station is permission for us to play it on air and to edit it for length or clarity. Do
                    not send a recording you would not want other listeners to hear.
                </li>
                <li>
                    Only send material that is yours to send, and do not include other people&rsquo;s
                    personal details.
                </li>
                <li>
                    We are not obliged to publish, broadcast, keep or reply to anything you send, and we may
                    remove it at any time.
                </li>
            </ul>

            <h2>7. Availability</h2>
            <p>
                We work to keep kJubilee on air, but we do not promise uninterrupted service. Streams,
                stations and features may be unavailable for maintenance, or because of faults, network
                problems or circumstances outside our control. We may change or withdraw any part of the
                service.
            </p>

            <h2>8. Suspension, and closing your account</h2>
            <p>
                You may close your account at any time from your account settings. Closing it deletes your
                account and the listening preferences attached to it — see the{' '}
                <a href="/privacy">Privacy Policy</a> for exactly what that removes and what is kept.
            </p>
            <p>
                We may suspend or close an account that breaks these terms, that is used to harm the service
                or other listeners, or where we are required to by law. Where it is reasonable to do so, we
                will tell you why.
            </p>

            <h2>9. Disclaimers</h2>
            <p>
                kJubilee is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>. To
                the fullest extent the law allows, we make no warranties of any kind, express or implied,
                including any implied warranty of merchantability, fitness for a particular purpose or
                non-infringement.
            </p>
            <p>
                Programming on kJubilee includes teaching, testimony and other spoken material. It is offered
                for encouragement and edification. It is not, and is not a substitute for, professional
                medical, psychological, financial or legal advice.
            </p>

            <h2>10. Limitation of liability</h2>
            <p>
                To the fullest extent permitted by law, Jubilee Software, Inc. and its officers, employees
                and artists will not be liable for any indirect, incidental, special, consequential or
                punitive damages, or for any loss of data, goodwill or anticipated savings, arising out of
                your use of — or inability to use — kJubilee.
            </p>
            <p>
                Nothing in these terms limits liability that cannot lawfully be limited, including for death
                or personal injury caused by negligence, or for fraud.
            </p>

            <h2>11. Changes to these terms</h2>
            <p>
                We may update these terms as the service changes. When we do, we will revise the
                &ldquo;last updated&rdquo; date at the top of this page, and for material changes we will
                give notice through the service or by email. Continuing to use kJubilee after a change means
                you accept the revised terms.
            </p>

            <h2>12. Contact</h2>
            <p>
                Questions about these terms, or about anything on kJubilee, can be sent to{' '}
                <a href="mailto:ops@kjubilee.com">ops@kjubilee.com</a>.
            </p>
            <p>Jubilee Software, Inc. — kJubilee.com</p>
        </LegalPage>
    );
}
