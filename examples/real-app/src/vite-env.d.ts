/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRISABASE_URL?: string;
  readonly VITE_BRISABASE_PROJECT_ID?: string;
  readonly VITE_BRISABASE_ENVIRONMENT_ID?: string;
  readonly VITE_BRISABASE_PUBLIC_KEY?: string;
  readonly VITE_BRISABASE_PRODUCTS_TABLE?: string;
  readonly VITE_BRISABASE_REALTIME_TABLE?: string;
  readonly VITE_BRISABASE_STORAGE_BUCKET?: string;
  readonly VITE_BRISABASE_FUNCTION_SLUG?: string;
}
