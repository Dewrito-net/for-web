import { For, splitProps } from "solid-js";

import { Channel, VoiceParticipant } from "stoat.js";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { UserContextMenu } from "@revolt/app";
import { useUser } from "@revolt/markdown/users";

import { Avatar, Ripple, typography } from "../../design";
import { Row } from "../../layout";

import { VoiceStatefulUserIcons } from "./VoiceStatefulUserIcons";

/**
 * Render a preview of users for a given voice channel
 *
 * Shows all voice participants regardless of whether you're connected.
 * Data comes from backend via WebSocket events (VoiceChannelJoin/Leave/Move).
 * Designed for the server sidebar to be below channels.
 */
export function VoiceChannelPreview(props: { channel: Channel }) {
  return <VariantPreview channel={props.channel} />;
}

/**
 * Use API as the source of truth to display all voice participants
 */
function VariantPreview(props: { channel: Channel }) {
  const participants = () => [...props.channel.voiceParticipants.values()];
  
  return (
    <Show when={participants().length > 0}>
      <Base>
        <For each={participants()}>
          {(participant) => <ParticipantPreview participant={participant} />}
        </For>
      </Base>
    </Show>
  );
}

/**
 * Preview variant of participant
 */
function ParticipantPreview(props: { participant: VoiceParticipant }) {
  return (
    <CommonUser
      userId={props.participant.userId}
      speaking={false}
      muted={!props.participant.isPublishing()}
      deafened={!props.participant.isReceiving()}
      camera={props.participant.isCamera()}
      screenshare={props.participant.isScreensharing()}
    />
  );
}

/**
 * Component used for both variants
 */
function CommonUser(props: {
  userId: string;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
  camera: boolean;
  screenshare: boolean;
  isLive?: boolean;
}) {
  const [iconProps, rest] = splitProps(props, [
    "muted",
    "deafened",
    "camera",
    "screenshare",
  ]);

  const user = useUser(() => rest.userId);

  return (
    <div
      class={previewUser({ speaking: rest.speaking })}
      use:floating={{
        userCard: {
          user: user().user!,
          member: user().member,
        },
        contextMenu: () => (
          <UserContextMenu
            user={user().user!}
            member={user().member}
            inVoice={rest.isLive}
          />
        ),
      }}
    >
      <Ripple />
      <Avatar size={24} src={user().avatar} fallback={user().username} />{" "}
      <PreviewUsername>{user().username}</PreviewUsername>
      <Row gap="sm">
        <VoiceStatefulUserIcons {...iconProps} userId={rest.userId} />
      </Row>
    </div>
  );
}

const Base = styled("div", {
  base: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",

    marginBlock: "var(--gap-sm)",
    marginInlineStart: "var(--gap-xl)",
    marginInlineEnd: "var(--gap-md)",

    color: "var(--md-sys-color-outline)",

    borderRadius: "var(--borderRadius-md)",
  },
});

const previewUser = cva({
  base: {
    padding: "var(--gap-sm)",
    position: "relative", // ... <Ripple />
    display: "flex",
    gap: "var(--gap-md)",
    alignItems: "center",
    borderRadius: "var(--borderRadius-md)",
  },
  variants: {
    speaking: {
      true: {
        color: "var(--md-sys-color-on-surface)",

        "& svg": {
          outlineOffset: "1px",
          outline: "2px solid var(--md-sys-color-primary)",
          borderRadius: "var(--borderRadius-circle)",
        },
      },
    },
  },
});

const PreviewUsername = styled("span", {
  base: {
    ...typography.raw(),

    flexGrow: 1,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
});
