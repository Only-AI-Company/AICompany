export interface HumanProfile {
  id: string;
  name: string;
  gender?: 'male' | 'female' | 'other';
  location?: string;
  birthday?: string; // YYYY-MM-DD 格式
  appearance?: string;
  personalityTraits?: string[];
  hobbies?: string[];
  workPreferences?: {
    preferredHours?: string;
    communicationStyle?: 'direct' | 'diplomatic' | 'minimal';
    workEnvironment?: 'quiet' | 'collaborative' | 'flexible';
  };
  skills?: string[];
  weaknesses?: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateHumanInput {
  name: string;
  gender?: 'male' | 'female' | 'other';
  location?: string;
  birthday?: string; // YYYY-MM-DD 格式
  appearance?: string;
  personalityTraits?: string[];
  hobbies?: string[];
  workPreferences?: {
    preferredHours?: string;
    communicationStyle?: 'direct' | 'diplomatic' | 'minimal';
    workEnvironment?: 'quiet' | 'collaborative' | 'flexible';
  };
  skills?: string[];
  weaknesses?: string[];
  notes?: string;
}