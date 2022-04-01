import { WorkspaceFolder } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { Telemetry } from '../telemetry';
import { isRelativePath, relativeToAbsolutePath } from './paths';

export const JSON_SCHEMASTORE_URL = 'https://www.schemastore.org/api/json/catalog.json';

export function checkSchemaURI(
  workspaceFolders: WorkspaceFolder[],
  workspaceRoot: URI,
  uri: string,
  telemetry: Telemetry
): string {
  if (isRelativePath(uri)) {
    return relativeToAbsolutePath(workspaceFolders, workspaceRoot, uri);
  } else {
    return uri;
  }
}
