import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  id: string;
  name: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder: string;
  id: string;
}

export const CustomSelect = ({ 
  value, 
  onChange, 
  options, 
  placeholder, 
  id 
}: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(option => option.id === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-white text-left text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-600 transition-all duration-300 ease-in-out text-sm leading-5 flex items-center justify-between"
      >
        <span className={selectedOption ? 'text-gray-900' : 'text-gray-500'}>
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        <ChevronDown 
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </button>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id);
                setIsOpen(false);
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none flex items-center justify-between transition-colors duration-150"
            >
              <span>{option.name}</span>
              {value === option.id && (
                <Check className="h-4 w-4 text-gray-600" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};