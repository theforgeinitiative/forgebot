// Startup sanity check of the bot's own guild setup. Discord answers role
// and nickname changes with a bare "Missing Permissions" (50013), so explain
// the likely causes once at boot instead.
export type SetupFacts = {
  canManageRoles: boolean
  canManageNicknames: boolean
  memberRole: { name: string; managed: boolean; belowBotTopRole: boolean } | null
  welcomeChannelSendable: boolean
  // both null when /emergency-info isn't configured
  keyholderRoleExists: boolean | null
  emergencyLogChannelSendable: boolean | null
}

export function setupProblems(f: SetupFacts): string[] {
  const problems: string[] = []
  if (!f.canManageRoles) problems.push('bot lacks the Manage Roles permission')
  if (!f.canManageNicknames) problems.push('bot lacks the Manage Nicknames permission (nicknames will not be set)')
  if (!f.memberRole) {
    problems.push('DISCORD_MEMBER_ROLE_ID is not a role in this guild')
  } else {
    if (f.memberRole.managed) {
      problems.push(`member role "${f.memberRole.name}" is managed by an integration and cannot be assigned`)
    }
    if (!f.memberRole.belowBotTopRole) {
      problems.push(
        `member role "${f.memberRole.name}" is not below the bot's highest role; drag the bot's role above it in Server Settings → Roles`,
      )
    }
  }
  if (!f.welcomeChannelSendable) {
    problems.push('bot cannot send messages in DISCORD_WELCOME_CHANNEL_ID')
  }
  if (f.keyholderRoleExists === false) {
    problems.push('DISCORD_KEYHOLDER_ROLE_ID is not a role in this guild (/emergency-info will refuse everyone)')
  }
  if (f.emergencyLogChannelSendable === false) {
    problems.push('bot cannot send messages in EMERGENCY_LOG_CHANNEL_ID (/emergency-info lookups will only be logged to the console)')
  }
  return problems
}
