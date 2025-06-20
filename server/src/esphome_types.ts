export const MESSAGE_READ_FILE = "read_file";
export const MESSAGE_FILE_RESPONSE = "file_response";
export const MESSAGE_RESULT = "result";
export const MESSAGE_CHECK_FILE = "check_file_exists";
export const MESSAGE_CHECK_DIRECTORY = "check_directory_exists";
export const MESSAGE_VERSION = "version";
export const MESSAGE_STD_ERR_OUT = "std_err_out";

export interface EsphomeRange {
  document: string;
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
}

export interface ValidationError {
  range: EsphomeRange | null;
  message: string;
}

export interface MessageReadFile {
  type: typeof MESSAGE_READ_FILE;
  path: string;
}

export interface YamlValidationError {
  message: string;
}

export interface MessageResult {
  type: typeof MESSAGE_RESULT;
  validation_errors: ValidationError[];
  yaml_errors: YamlValidationError[];
}
export interface MessageStdErrOut {
  type: typeof MESSAGE_STD_ERR_OUT;
  std_err: string;
}

export interface MessageCheckFileExists {
  type: typeof MESSAGE_CHECK_FILE;
  path: string;
}

export interface MessageCheckDirectoryExists {
  type: typeof MESSAGE_CHECK_DIRECTORY;
  path: string;
}

export interface MessageVersion {
  type: typeof MESSAGE_VERSION;
  value: string;
}

export type MessageTypes =
  | MessageReadFile
  | MessageResult
  | MessageCheckFileExists
  | MessageCheckDirectoryExists
  | MessageVersion
  | MessageStdErrOut;
