export interface StoredResponse {
  inputText: string;
  outputText: string;
}

export class PreviousResponseNotFoundError extends Error {
  constructor(responseId: string) {
    super(`No stored response exists for ${responseId}`);
    this.name = "PreviousResponseNotFoundError";
  }
}

export class InMemoryResponseStore {
  private readonly responses = new Map<string, StoredResponse>();

  get(responseId: string): StoredResponse {
    const response = this.responses.get(responseId);
    if (!response) throw new PreviousResponseNotFoundError(responseId);
    return response;
  }

  put(responseId: string, response: StoredResponse): void {
    this.responses.set(responseId, response);
  }
}
