// User-facing copy and component builders, kept together so wording can be
// reviewed in one place. Strings are carried over from the Go bot unless
// noted.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'

export const MEMBER_APP_URL = 'https://app.theforgeinitiative.org'
export const ID_RECOVERY_URL = 'https://www.tfaforms.com/4764292'

export const CUSTOM_IDS = {
  showLinkForm: 'show_link_form',
  linkMembershipForm: 'link_membership_form',
  hid: 'hid',
  pid: 'pid',
} as const

const WELCOME_HELP = `**:link: Link your membership:**
To keep this a safe space for Forge members of all ages, many of our channels are only open to members. To access them, click the button below to link your Discord user to your Forge membership. You will need your Household and Personal IDs which can be found in the Member App or recovered via the form below.`

export const welcomeNewMember = (userId: string) =>
  `Welcome to the TFI Discord server, <@${userId}>!\n\n${WELCOME_HELP}`

export const WELCOME_SLASH = `Welcome to the TFI Discord server!\n\n${WELCOME_HELP}`

export const welcomeLinkedMember = (userId: string) =>
  `Welcome, <@${userId}>! You've already linked your membership, so you're good to go. :sunglasses:`

export const LINK = {
  verifying: 'Verifying your membership... :thinking:',
  notFound:
    "Sorry, I wasn't able to find your HID/PID. Use the recovery link below if you can't find it.",
  saveFailed:
    "I had trouble linking your membership, but it's probably not your fault. Please try again.",
  // New: linking no longer grants access to lapsed memberships
  notCurrent:
    ":link: Your Discord account is now linked, but your membership isn't current, so I can't open the member areas yet. Once it's renewed, run `/link-membership` again.",
  roleFailed: 'I encountered an error trying to give you a role. Please try again.',
  success:
    ":tada: You're all set! If you didn't already have access, check out all the new member areas.",
} as const

export const STORAGE = {
  generating: 'Generating an unlock code... :thinking:',
  notLinked:
    ":woozy_face: Oof! We encountered a problem generating an unlock code. Please ensure you've linked your membership to your Discord account and try again.",
  notCurrent: ':customs: You must be a current member to access TFI storage.',
  failed:
    ":woozy_face: Oof! We encountered a problem generating an unlock code. Please try again and ask for help if you're stuck.",
  // Changed: the Request Access button is gone; ops approves in Salesforce
  notApproved:
    ':octagonal_sign: You need to be approved to unlock storage. If you believe you require access, ask an admin.',
  awaitingApproval: ':customs: Your request for storage access is still awaiting approval.',
  // Changed: the Go bot reused the generic failure text here
  dmFailed:
    ":woozy_face: Oof! I couldn't send you a DM with the code. Make sure your privacy settings allow DMs from server members, then try again.",
  done: ":unlock: You're in!",
} as const

export const GENERIC_ERROR =
  ":woozy_face: Oof! Something went wrong. Please try again and ask for help if you're stuck."

export function storageDm(opts: {
  pin: string
  unit: string
  validUntil: string
  additionalInstructions: string
}): string {
  const body =
    `:unlock: You're in!\n\nEnter code \`${opts.pin}\` followed by the :unlock: button to open **unit ${opts.unit}**.` +
    `\n\nThis code is valid until **${opts.validUntil}**`
  return opts.additionalInstructions ? `${body}\n\n${opts.additionalInstructions}` : body
}

function memberAppButton() {
  return new ButtonBuilder()
    .setLabel('Member App')
    .setEmoji('📱')
    .setStyle(ButtonStyle.Link)
    .setURL(MEMBER_APP_URL)
}

function idRecoveryButton() {
  return new ButtonBuilder()
    .setLabel('ID Recovery Form')
    .setEmoji('🔍')
    .setStyle(ButtonStyle.Link)
    .setURL(ID_RECOVERY_URL)
}

export function welcomeComponents() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.showLinkForm)
        .setLabel('Link Membership')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(memberAppButton(), idRecoveryButton()),
  ]
}

export function recoveryComponents() {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(memberAppButton(), idRecoveryButton())]
}

export function memberAppComponents() {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(memberAppButton())]
}

export function checkDmComponents(dmChannelId: string) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Check your DMs')
        .setEmoji('📩')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/@me/${dmChannelId}`),
    ),
  ]
}

export function linkMembershipModal() {
  return new ModalBuilder()
    .setCustomId(CUSTOM_IDS.linkMembershipForm)
    .setTitle('Link to your TFI membership')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Household ID')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(CUSTOM_IDS.hid)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('H01234')
            .setRequired(true)
            .setMinLength(6)
            .setMaxLength(6),
        ),
      new LabelBuilder()
        .setLabel('Personal ID')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(CUSTOM_IDS.pid)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('P012345')
            .setRequired(true)
            .setMinLength(7)
            .setMaxLength(7),
        ),
    )
}
