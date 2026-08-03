export function createComboCommitMessageState(
  initialMessage: string,
  syncMessage: (message: string) => void,
) {
  let message = initialMessage;

  return {
    getMessage: () => message,
    setMessage(nextMessage: string) {
      message = nextMessage;
      syncMessage(nextMessage);
    },
  };
}
