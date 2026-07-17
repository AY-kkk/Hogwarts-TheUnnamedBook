# Deterministic core loop

The model narrates outcomes but does not own game mechanics. The backend validates the browser-owned status snapshot, computes the next allowed turn boundary, performs the check and gives the narrator an authoritative rules result. The browser then validates the resulting `<state_update>` again before an atomic IndexedDB write.

## Prologue

Turn 1 is created by the story-start endpoint. Each later accepted action may advance only to the next of the nine fixed turns. Calendar anchors are fixed by the prologue script. Turn 9 enters September week 1 in weekly mode and grants 7 AP.

## Weekly mode

A normal action settles exactly one week. There are four weeks per month. Week 4 advances to week 1 of the following month, with December rolling into January of the following year.

Players receive 7 AP. A declared weekly plan may spend at most 10 AP; the extra 1-3 AP is an overdraft and reduces next week's AP by the same amount. Plans above 10 AP are rejected without advancing time. Unused AP is narrative rest/social time and does not carry forward.

## Event mode

A weekly scene may enter `event_start`. While in an event, `event_continue` and `event_resolve` consume no AP and cannot change the calendar. Resolution returns to weekly mode at the same calendar position.

## Ability gates

Known spell tiers have hard knowledge thresholds before a random check is allowed. Failing a prerequisite is a final failure result; the narrator may describe a safe consequence but cannot upgrade it to success. Other actions use a server-side D20 and a bounded attribute modifier. Rolls and rule outcomes are included in the rules result passed to the narrator.
