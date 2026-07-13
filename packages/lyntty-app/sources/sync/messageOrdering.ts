import type { ApiMessage } from './apiTypes';

/** Session-protocol events are stateful and must enter the reducer oldest-first. */
export function orderApiMessagesForReducer(messages: ApiMessage[]): ApiMessage[] {
    return [...messages].sort((left, right) => left.seq - right.seq);
}
