// Newsletter Studio approval thread.
// API resource: GET /newsletter/approval-chat → ChatMessage[]

export type ChatMessage = { from: string; text: string; mine: boolean };

export const approvalChat: ChatMessage[] = [
  {
    from: "Sarah",
    text: "Looks good, but can we highlight the new Pyrethroid research from the Knowledge Hub?",
    mine: false,
  },
  { from: "You", text: "Added that to section 2. Ready for approval?", mine: true },
];
