"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

function getGender(id: string): string {
  if (BULBUL_V3_VOICES.female.some((v) => v.id === id)) return "Female";
  if (BULBUL_V3_VOICES.male.some((v) => v.id === id)) return "Male";
  return "";
}

export function VoiceSelector({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className={className ?? "w-full"}>
        <SelectValue placeholder="Select a voice" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Female</SelectLabel>
          {BULBUL_V3_VOICES.female.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Male</SelectLabel>
          {BULBUL_V3_VOICES.male.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export { getGender, BULBUL_V3_VOICES };
