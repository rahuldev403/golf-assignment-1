"use client";

import { createClient } from "@supabase/supabase-js";
import { Edit2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Charity = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_featured: boolean;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

type FormState = {
  name: string;
  description: string;
  category: string;
  is_featured: boolean;
  image_url: string;
};

type CharityManagementProps = {
  initialCharities: Charity[];
};

const INITIAL_FORM_STATE: FormState = {
  name: "",
  description: "",
  category: "",
  is_featured: false,
  image_url: "",
};

async function getAccessToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/auth/verify-jwt", {
      method: "GET",
    });
    const data = (await response.json()) as { token?: string };
    return data.token || null;
  } catch {
    return null;
  }
}

async function uploadImageToStorage(
  file: File,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<string | null> {
  try {
    const client = createClient(supabaseUrl, supabaseKey);
    const fileName = `${Date.now()}-${file.name}`;

    const { data, error } = await client.storage
      .from("charity-media")
      .upload(fileName, file);

    if (error) {
      throw error;
    }

    // Get the public URL
    const {
      data: { publicUrl },
    } = client.storage.from("charity-media").getPublicUrl(data.path);

    return publicUrl;
  } catch (error) {
    console.error("Image upload error:", error);
    return null;
  }
}

export default function CharityManagement({
  initialCharities,
}: CharityManagementProps) {
  const [charities, setCharities] = useState<Charity[]>(initialCharities);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCharityId, setEditingCharityId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(INITIAL_FORM_STATE);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const supabaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    [],
  );
  const supabaseKey = useMemo(
    () =>
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      "",
    [],
  );

  const filteredCharities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return charities;
    return charities.filter(
      (charity) =>
        charity.name.toLowerCase().includes(query) ||
        (charity.category?.toLowerCase().includes(query) ?? false),
    );
  }, [charities, searchQuery]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImageSelection = () => {
    setImageFile(null);
    setImagePreview("");
  };

  const openNewCharityModal = () => {
    setEditingCharityId(null);
    setFormState(INITIAL_FORM_STATE);
    clearImageSelection();
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (charity: Charity) => {
    setEditingCharityId(charity.id);
    setFormState({
      name: charity.name,
      description: charity.description || "",
      category: charity.category || "",
      is_featured: charity.is_featured,
      image_url: charity.image_url || "",
    });
    setImagePreview(charity.image_url || "");
    clearImageSelection();
    setError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCharityId(null);
    setFormState(INITIAL_FORM_STATE);
    clearImageSelection();
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Validate form
      if (!formState.name.trim()) {
        setError("Charity name is required.");
        setIsLoading(false);
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated. Please log in.");
        setIsLoading(false);
        return;
      }

      let imageUrl = formState.image_url;

      // Upload image if a new one was selected
      if (imageFile) {
        const uploadedUrl = await uploadImageToStorage(
          imageFile,
          supabaseUrl,
          supabaseKey,
        );
        if (!uploadedUrl) {
          setError("Failed to upload image.");
          setIsLoading(false);
          return;
        }
        imageUrl = uploadedUrl;
      }

      // Prepare request payload
      const payload = {
        name: formState.name.trim(),
        description: formState.description.trim() || null,
        category: formState.category.trim() || null,
        is_featured: formState.is_featured,
        image_url: imageUrl || null,
        ...(editingCharityId && { id: editingCharityId }),
      };

      // Make API call
      const endpoint =
        editingCharityId === null
          ? "/api/admin/charities"
          : "/api/admin/charities";
      const method = editingCharityId === null ? "POST" : "PUT";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        success: boolean;
        data?: Charity;
        error?: string;
      };

      if (!response.ok || !result.success) {
        setError(result.error || "Failed to save charity.");
        setIsLoading(false);
        return;
      }

      // Update local state
      if (editingCharityId === null) {
        // Adding new charity
        if (result.data) {
          setCharities((prev) => [...prev, result.data as Charity]);
          setSuccessMessage("Charity created successfully!");
        }
      } else {
        // Updating existing charity
        if (result.data) {
          setCharities((prev) =>
            prev.map((charity) =>
              charity.id === editingCharityId
                ? (result.data as Charity)
                : charity,
            ),
          );
          setSuccessMessage("Charity updated successfully!");
        }
      }

      closeModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (charityId: string, charityName: string) => {
    if (
      !window.confirm(`Delete charity "${charityName}"? This cannot be undone.`)
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated. Please log in.");
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/admin/charities", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: charityId }),
      });

      const result = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (!response.ok || !result.success) {
        setError(result.error || "Failed to delete charity.");
        setIsLoading(false);
        return;
      }

      // Update local state
      setCharities((prev) =>
        prev.filter((charity) => charity.id !== charityId),
      );
      setSuccessMessage("Charity deleted successfully!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          {successMessage}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground">
          Charity Management
        </h1>
        <button
          onClick={openNewCharityModal}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground transition hover:brightness-110"
        >
          <Plus size={20} />
          Add New Charity
        </button>
      </div>

      {/* Search Bar */}
      <div className="w-full">
        <input
          type="text"
          placeholder="Search by name or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted">
            <tr>
              <th className="px-6 py-4 font-semibold text-foreground">Name</th>
              <th className="px-6 py-4 font-semibold text-foreground">
                Category
              </th>
              <th className="px-6 py-4 font-semibold text-foreground">
                Featured
              </th>
              <th className="px-6 py-4 font-semibold text-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredCharities.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-8 text-center text-muted-foreground"
                >
                  No charities found
                </td>
              </tr>
            ) : (
              filteredCharities.map((charity) => (
                <tr
                  key={charity.id}
                  className="border-b border-border hover:bg-muted/50"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {charity.image_url && (
                        <img
                          src={charity.image_url}
                          alt={charity.name}
                          className="h-10 w-10 rounded-md object-cover"
                        />
                      )}
                      <span className="font-medium text-foreground">
                        {charity.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {charity.category || "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        charity.is_featured
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {charity.is_featured ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      <button
                        onClick={() => openEditModal(charity)}
                        disabled={isLoading}
                        className="flex items-center gap-1 rounded px-3 py-2 text-sm text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                      >
                        <Edit2 size={16} />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(charity.id, charity.name)}
                        disabled={isLoading}
                        className="flex items-center gap-1 rounded px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-lg bg-background p-6 shadow-xl">
            {/* Modal Header */}
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">
                {editingCharityId === null ? "Add New Charity" : "Edit Charity"}
              </h2>
              <button
                onClick={closeModal}
                disabled={isLoading}
                className="rounded p-1 transition hover:bg-muted disabled:opacity-50"
              >
                <X size={24} className="text-foreground" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name Field */}
              <div>
                <label className="block text-sm font-semibold text-foreground">
                  Name *
                </label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(e) =>
                    setFormState({ ...formState, name: e.target.value })
                  }
                  placeholder="Charity name"
                  required
                  disabled={isLoading}
                  className="mt-2 w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
              </div>

              {/* Description Field */}
              <div>
                <label className="block text-sm font-semibold text-foreground">
                  Description
                </label>
                <textarea
                  value={formState.description}
                  onChange={(e) =>
                    setFormState({ ...formState, description: e.target.value })
                  }
                  placeholder="Charity description"
                  disabled={isLoading}
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
              </div>

              {/* Category Field */}
              <div>
                <label className="block text-sm font-semibold text-foreground">
                  Category
                </label>
                <input
                  type="text"
                  value={formState.category}
                  onChange={(e) =>
                    setFormState({ ...formState, category: e.target.value })
                  }
                  placeholder="e.g., Education, Health, Environment"
                  disabled={isLoading}
                  className="mt-2 w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
              </div>

              {/* Image Upload */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-foreground">
                  Logo/Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  disabled={isLoading}
                  className="w-full text-sm text-muted-foreground file:mr-4 file:rounded file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 disabled:opacity-50"
                />
                {imagePreview && (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                    {imageFile && (
                      <button
                        type="button"
                        onClick={clearImageSelection}
                        disabled={isLoading}
                        className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Is Featured Toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_featured"
                  checked={formState.is_featured}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      is_featured: e.target.checked,
                    })
                  }
                  disabled={isLoading}
                  className="h-4 w-4 cursor-pointer rounded border-input accent-blue-600 disabled:opacity-50"
                />
                <label
                  htmlFor="is_featured"
                  className="text-sm font-semibold text-foreground"
                >
                  Mark as Featured
                </label>
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isLoading}
                  className="flex-1 rounded-lg border border-input bg-background px-4 py-2 font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading
                    ? "Saving..."
                    : editingCharityId === null
                      ? "Create Charity"
                      : "Update Charity"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
