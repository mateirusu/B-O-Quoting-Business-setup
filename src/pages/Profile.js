import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabaseClient";

export default function Profile() {
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
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingEmailChange, setPendingEmailChange] = useState(null); // new email awaiting confirmation

  useEffect(() => {
    setFirstName(profile?.first_name ?? "");
    setLastName(profile?.last_name ?? "");
    setEmail(profile?.email ?? "");
    setMobile(profile?.mobile_number ?? "");
    setProfileImageUrl(profile?.profile_image_url ?? "");
    setPreviewUrl(profile?.profile_image_url ?? "");
  }, [profile]);

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
    if (!user?.id) return null;

    const fileExt = file.name.split(".").pop();
    const filePath = `avatars/${user.id}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    return data?.publicUrl;
  };

  const handleSaveClick = (event) => {
    event.preventDefault();
    setShowConfirm(true);
  };

  const handleConfirmSave = async () => {
    setShowConfirm(false);
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      let imageUrl = profileImageUrl;
      if (imageFile) {
        imageUrl = await uploadProfileImage(imageFile);
      }

      const { error: profileError } = await supabase
        .from("profile")
        .update({
          first_name: firstName,
          last_name: lastName,
          mobile_number: mobile || null,
          profile_image_url: imageUrl,
        })
        .eq("user_id", user.id);

      if (profileError) throw profileError;

      const currentAuthEmail = session?.user?.email ?? "";
      const newEmail = email.trim();
      const emailChanged = newEmail && newEmail !== currentAuthEmail;

      if (emailChanged) {
        let businessName = "";
        if (profile?.business_id) {
          const { data: bizData } = await supabase
            .from("business")
            .select("business_name")
            .eq("business_id", profile.business_id)
            .maybeSingle();
          businessName = bizData?.business_name ?? "";
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${sessionData?.session?.access_token}`,
            "apikey": SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: newEmail,
            data: { business_name: businessName },
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!authRes.ok) {
          const errBody = await authRes.json().catch(() => ({}));
          throw new Error(errBody.msg || errBody.message || `Email update failed (${authRes.status})`);
        }

        localStorage.setItem('email_change_pending', newEmail);
      }

      await refreshProfile();
      setImageFile(null);

      if (emailChanged) {
        setPendingEmailChange(newEmail);
      } else {
        setMessage("Profile saved successfully.");
      }
    } catch (saveError) {
      setError(saveError.message || "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirm(false);
  };

  const emailError = email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? "Enter a valid email address."
    : null;

  const mobileError = mobile && !/^\+?[\d\s\-().]{7,15}$/.test(mobile.trim())
    ? "Enter a valid mobile number."
    : null;

  const isDirty =
    firstName !== (profile?.first_name ?? "") ||
    lastName !== (profile?.last_name ?? "") ||
    email !== (profile?.email ?? "") ||
    mobile !== (profile?.mobile_number ?? "") ||
    imageFile !== null;

  const canSave = isDirty && !emailError && !mobileError;

  const handleDiscard = () => {
    setFirstName(profile?.first_name ?? "");
    setLastName(profile?.last_name ?? "");
    setEmail(profile?.email ?? "");
    setMobile(profile?.mobile_number ?? "");
    setProfileImageUrl(profile?.profile_image_url ?? "");
    setPreviewUrl(profile?.profile_image_url ?? "");
    setImageFile(null);
    setMessage(null);
    setError(null);
  };

  return (
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
          onChange={(event) => { setEmail(event.target.value); setPendingEmailChange(null); }}
          className="w-full rounded-2xl border bg-zinc-950 px-4 py-3 text-white focus:outline-none"
          style={{ borderColor: emailError ? '#ef4444' : undefined }}
        />
        {emailError && <span className="text-xs text-red-400">{emailError}</span>}
      </div>

      <div className="flex flex-col gap-3">
        <label className="block text-slate-400">Mobile</label>
        <input
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
          className="w-full rounded-2xl border bg-zinc-950 px-4 py-3 text-white focus:outline-none"
          style={{ borderColor: mobileError ? '#ef4444' : undefined }}
        />
        {mobileError && <span className="text-xs text-red-400">{mobileError}</span>}
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

      {pendingEmailChange && (
        <div className="rounded-2xl bg-sky-500/10 border border-sky-500 p-4 text-sky-200 text-sm">
          A confirmation link has been sent to <strong>{pendingEmailChange}</strong>. Your login email will update once you confirm it. Please check your inbox.
        </div>
      )}

      {isDirty && !pendingEmailChange && (
        <div className="flex gap-3">
          <button
            onClick={handleDiscard}
            disabled={saving}
            className="rounded-2xl border border-zinc-600 px-5 py-3 font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            Discard
          </button>
          {canSave && (
            <button
              onClick={handleSaveClick}
              disabled={saving}
              className="rounded-2xl bg-sky-500 px-5 py-3 font-semibold text-black hover:bg-sky-400 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
          )}
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center" style={{ zIndex: 50 }}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-xl font-bold">Confirm Changes</h3>
            <p className="text-slate-300">Are you sure you want to update your profile details?</p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmSave}
                className="flex-1 rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-black hover:bg-sky-400"
              >
                Yes, Save
              </button>
              <button
                onClick={handleCancelConfirm}
                className="flex-1 rounded-2xl bg-zinc-800 px-4 py-3 font-semibold text-white hover:bg-zinc-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}