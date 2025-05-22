

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import AlbumFormDialog from "./AlbumDialog";

export default function AlbumHeader() {
  return (
    <div className="flex justify-between items-center mb-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Albums</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage and organize your photography collections
        </p>
      </div>
      <AlbumFormDialog
        trigger={
          <Button
           className="flex items-center gap-2 cursor-pointer bg-black text-white hover:bg-black/80 rounded-[6px]" 
          >
            <Plus className="mr-2 h-4 w-4" /> Create Album
          </Button>
        }
      />
    </div>
  );
}