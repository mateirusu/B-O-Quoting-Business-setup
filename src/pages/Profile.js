import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";

export default function Profile({ inline = false }) {
  const { session, profile, refreshProfile } = useAuth();
  const user = session?.user;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setFirstName(profile?.first_name ?? "");
    setLastName(profile?.last_name ?? "");
    setMobile(profile?.mobile_number ?? "");
    setProfileImageUrl(profile?.profile_image_url ?? "");
    setPreviewUrl(profile?.profile_image_url ?? "");
    setEmail(user?.email ?? "");
  }, [profile, user]);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setImageFile(file);
    setPreviewUrl(objectUrl);
  };

  const uploadProfileImage = async (file) => {
    if (!session?.user?.id) return null;

    const fileExt = file.name.split(".").pop();
    const filePath = `avatars/${session.user.id}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    return data?.publicUrl;
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      let imageUrl = profileImageUrl;
      if (imageFile) {
        imageUrl = await uploadProfileImage(imageFile);
      }

      if (email && email !== user?.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email });
        if (emailError) {
          throw emailError;
        }
      }

      const { error: profileError } = await supabase.from("profile").upsert(
        {
          user_id: user?.id,
          first_name: firstName,
          last_name: lastName,
          mobile_number: mobile,
          profile_image_url: imageUrl,
        },
        { onConflict: "user_id" }
      );

      if (profileError) {
        throw profileError;
      }

      await refreshProfile();
      setMessage("Profile saved successfully.");
      setImageFile(null);
    } catch (saveError) {
      setError(saveError.message || "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <div className="bg-zinc-900 p-6 rounded-2xl space-y-6">
      <div className="flex flex-col gap-3">
        <label className="block text-slate-400">First Name</label>
        <input
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:border-sky-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="block text-slate-400">Last Name</label>
        <input
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:border-sky-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="block text-slate-400">Email</label>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:border-sky-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="block text-slate-400">Mobile</label>
        <input
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:border-sky-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="block text-slate-400">Profile Image</label>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Profile preview"
            className="h-28 w-28 rounded-full object-cover border border-zinc-700"
          />
        ) : (
          <div className="h-28 w-28 rounded-full bg-zinc-800 flex items-center justify-center text-slate-500">
            No image
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="text-slate-200"
        />
      </div>

      {message && <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500 p-4 text-emerald-200">{message}</div>}
      {error && <div className="rounded-2xl bg-red-500/10 border border-red-500 p-4 text-red-200">{error}</div>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-2xl bg-sky-500 px-5 py-3 font-semibold text-black hover:bg-sky-400 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Profile"}
      </button>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-2xl font-bold mb-4">Profile</h1>
      {content}
    </div>
  );
}
