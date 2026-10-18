import React from "react";
import LegalPage, { LegalSection, LegalText, MailLink } from "@/components/LegalPage";

const UPDATED = "18 October 2026";

const TermsPage: React.FC = () => (
  <LegalPage
    title="Terms"
    metaTitle="Terms of Use — WHOOP! WHOOP! Daily and Together"
    metaDescription="WHOOP! WHOOP! Daily and Together are free to play and provided as is. We may change or stop them at any time. Questions: hello@whoop-whoop.com."
    path="/terms"
    updated={UPDATED}
  >
    <LegalSection heading="The game is free">
      <LegalText>
        WHOOP! WHOOP! Daily and WHOOP! WHOOP! Together are free to play. There is nothing to buy,
        and no account is required.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Provided as is">
      <LegalText>
        The game is provided as is, without warranties of any kind. We do our best to keep it working
        and accurate, but we cannot promise it will always be available or free of faults, and we are
        not liable for any loss arising from using it.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Playing with other people">
      <LegalText>
        Together is played with other people in real time. Your display name is visible to everyone
        at your table.
      </LegalText>
      <LegalText>
        Choose a display name that is not offensive, does not impersonate someone else, and does not
        contain personal information. We may remove a name or block access if it is used to harass
        people.
      </LegalText>
      <LegalText>
        We cannot control what other players do or say. If a table turns unpleasant, leave it and
        start a new one.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Tables are open to anyone with the code">
      <LegalText>
        Table codes are shareable by design. Anyone holding a code can join that table. Do not share
        a code more widely than you mean to.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Play fair">
      <LegalText>
        Do not cheat, use bots or scripts, tamper with the game or its results, try to get into
        other people's accounts, or overload the service. We may reset results or block access if
        we see this.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Your account">
      <LegalText>
        Accounts are optional. Keep access to your email safe, since the sign-in code goes there.
        You can delete your account at any time in Settings. Our Privacy page explains what we
        store.
      </LegalText>
    </LegalSection>

    <LegalSection heading="We may change or stop it">
      <LegalText>
        We may change how the game works, or stop offering it, at any time and without notice. Puzzle
        history, streaks and stats may be reset as part of that.
      </LegalText>
    </LegalSection>

    <LegalSection heading="The game itself">
      <LegalText>
        The name, artwork, sounds and code are ours. Please do not copy or republish them without
        asking. Sharing your result is very much encouraged.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Get in touch">
      <LegalText>
        Anything at all, including licensing: <MailLink />.
      </LegalText>
    </LegalSection>
  </LegalPage>
);

export default TermsPage;
