"use client";

import { SearchSelect, type SearchSelectItem } from "@/components/dashboard/search-select";

const BULBUL_V3_VOICES = {
  female: [
    { id: "ritu", label: "Ritu" },
    { id: "priya", label: "Priya" },
    { id: "neha", label: "Neha" },
    { id: "pooja", label: "Pooja" },
    { id: "simran", label: "Simran" },
    { id: "kavya", label: "Kavya" },
    { id: "ishita", label: "Ishita" },
    { id: "shreya", label: "Shreya" },
    { id: "roopa", label: "Roopa" },
    { id: "tanya", label: "Tanya" },
    { id: "shruti", label: "Shruti" },
    { id: "suhani", label: "Suhani" },
    { id: "kavitha", label: "Kavitha" },
    { id: "rupali", label: "Rupali" },
  ],
  male: [
    { id: "shubh", label: "Shubh" },
    { id: "aditya", label: "Aditya" },
    { id: "rahul", label: "Rahul" },
    { id: "rohan", label: "Rohan" },
    { id: "amit", label: "Amit" },
    { id: "dev", label: "Dev" },
    { id: "ratan", label: "Ratan" },
    { id: "varun", label: "Varun" },
    { id: "manan", label: "Manan" },
    { id: "sumit", label: "Sumit" },
    { id: "kabir", label: "Kabir" },
    { id: "aayan", label: "Aayan" },
    { id: "ashutosh", label: "Ashutosh" },
    { id: "advait", label: "Advait" },
    { id: "anand", label: "Anand" },
    { id: "tarun", label: "Tarun" },
    { id: "sunny", label: "Sunny" },
    { id: "mani", label: "Mani" },
    { id: "gokul", label: "Gokul" },
    { id: "vijay", label: "Vijay" },
    { id: "mohit", label: "Mohit" },
    { id: "rehan", label: "Rehan" },
    { id: "soham", label: "Soham" },
  ],
} as const;

const VOICE_ITEMS: SearchSelectItem[] = [
  ...BULBUL_V3_VOICES.female.map((v) => ({ value: v.id, label: v.label, sublabel: "Female" })),
  ...BULBUL_V3_VOICES.male.map((v) => ({ value: v.id, label: v.label, sublabel: "Male" })),
];

export function VoiceSelector({
  value,
  onChange,
  className = "w-full",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      items={VOICE_ITEMS}
      placeholder="Select voice"
      searchPlaceholder="Search voices…"
      className={className}
    />
  );
}

export { BULBUL_V3_VOICES };
