export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface ListResponse<T> {
  list?: T[] | null;
  is_end?: boolean;
  last_id?: number;
}
