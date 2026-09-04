import React from "react";
import LegalPage, {
  LegalList,
  LegalSection,
  LegalText,
  MailLink,
} from "@/components/LegalPage";

const UPDATED = "4 September 2026";

const PrivacyPage: React.FC = () => (
  <LegalPage
    title="Privacy"
    metaTitle="Privacy Policy — WHOOP! WHOOP! Daily and Classic"
    metaDescription="What WHOOP! WHOOP! Daily and Classic collect: an email only if you give it, a random visitor ID, your Classic display name, and anonymous gameplay events. No ads, no cross-site tracking."
    path="/privacy"
    updated={UPDATED}
  >
    <LegalText>
      WHOOP! WHOOP! Daily and WHOOP! WHOOP! Classic are free memory games. This page describes
      exactly what they collect and why. There is no account to create, and you can play without
      giving us anything.
    </LegalText>

    <LegalSection heading="Your email address">
      <LegalText>
        We collect an email address only when you type one in and submit it, and only so we can send
        you the daily puzzle reminder. It is stored in our own database and also sent to
        ActiveCampaign, the email provider we use to send the reminder on our behalf.
      </LegalText>
      <LegalText>
        We do not send anything other than the daily puzzle email. You can unsubscribe at any time
        using the link in any email we send, or by writing to <MailLink />.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Your visitor ID">
      <LegalText>
        When you first play, the game stores a random visitor ID in your browser. It is used to
        remember your streak, your stats, and that you have already played today. It is not tied to
        your name or to any other identifier, and it is not shared with anyone.
      </LegalText>
      <LegalText>
        If you give us an email address, we link it to that visitor ID so your streak can follow you
        to another device. Clearing your browser storage removes the ID; your streak can be restored
        by entering the same email again.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Display names in Classic">
      <LegalText>
        WHOOP! WHOOP! Classic asks for a display name so other players at your table know who is
        who. It is up to six characters and you choose it. It is shown to everyone at your table
        while you play, so do not use your full name or anything you would not want a stranger to
        see.
      </LegalText>
      <LegalText>
        We store your display name with your table so the game can show scores. It is not linked to
        your email address and it is not used for anything else.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Tables in Classic">
      <LegalText>
        A Classic table has a six-character code. Anyone who has the code can join, so a table is
        only as private as the code you share. There is no password and no invitation list.
      </LegalText>
      <LegalText>
        While a game is running we store the table, who is sitting at it, and a record of each claim
        so the game can decide who called a match first. These records exist to make the game work
        and are not used to build a profile of you.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Gameplay events">
      <LegalText>
        We record anonymous events about how the game is played: rounds solved, misses, peeks,
        shares, and where a visit came from (the referring site or a campaign tag in the link). We
        use this to see which puzzles are too hard or too easy and to improve the game. These events
        carry the random visitor ID, never a name or an email.
      </LegalText>
    </LegalSection>

    <LegalSection heading="What we do not do">
      <LegalList
        items={[
          "No advertising, and no ad networks.",
          "No tracking of you across other websites.",
          "No selling or renting of your data to anyone.",
          "No third-party analytics or advertising trackers in the game.",
        ]}
      />
    </LegalSection>

    <LegalSection heading="Unsubscribing and deletion">
      <LegalText>
        To stop the emails, use the unsubscribe link in any email, or write to <MailLink />. To have
        your email address and your stored results deleted, write to <MailLink /> from the address
        you signed up with and ask for deletion. We will remove your address from our database and
        from ActiveCampaign, along with the results tied to it.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Children">
      <LegalText>
        The game is suitable for all ages, but we ask that anyone under 13 does not submit an email
        address without a parent or guardian's involvement.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Changes">
      <LegalText>
        If what we collect changes, we will update this page and the date at the top of it.
      </LegalText>
    </LegalSection>

    <LegalSection heading="Contact">
      <LegalText>
        Questions about any of this: <MailLink />.
      </LegalText>
    </LegalSection>
  </LegalPage>
);

export default PrivacyPage;
